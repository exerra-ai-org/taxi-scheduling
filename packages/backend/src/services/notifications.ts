import nodemailer from "nodemailer";
import webpush from "web-push";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import type { BookingStatus } from "shared/types";
import { db } from "../db/index";
import {
  bookings,
  driverAssignments,
  notificationEvents,
  notificationSubscriptions,
  users,
} from "../db/schema";
import type { DriverWatchdogResult } from "./driverWatchdog";

const APP_NAME = process.env.APP_NAME || "Taxi Concierge";
const APP_BASE_URL = (process.env.APP_BASE_URL || "http://localhost:5173").replace(
  /\/$/,
  "",
);

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:ops@taxi.local";

const EMAIL_FROM = process.env.EMAIL_FROM;
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || "587");
const SMTP_SECURE = String(process.env.SMTP_SECURE || "false") === "true";
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

const PUSH_ENABLED = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
const EMAIL_ENABLED = Boolean(SMTP_HOST && EMAIL_FROM);
let PUSH_READY = false;

if (PUSH_ENABLED) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
    PUSH_READY = true;
  } catch (cause) {
    console.error("Invalid VAPID configuration:", cause);
  }
}

let transporter: nodemailer.Transporter | null | undefined;

interface BookingContext {
  bookingId: number;
  pickupAddress: string;
  dropoffAddress: string;
  scheduledAt: Date;
  status: BookingStatus;
  customerId: number;
  customerName: string;
  pricePence: number;
  activeDriverIds: number[];
  primaryDriverId: number | null;
  backupDriverId: number | null;
  adminIds: number[];
}

interface RideMessage {
  title: string;
  body: string;
  url: string;
  tag?: string;
  emailSubject?: string;
}

function formatStatus(status: BookingStatus): string {
  return status.replace(/_/g, " ").toUpperCase();
}

function formatMoney(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function formatSchedule(date: Date): string {
  return date.toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function absoluteUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${APP_BASE_URL}${normalized}`;
}

function uniqIds(userIds: number[]): number[] {
  return Array.from(new Set(userIds.filter((id) => Number.isInteger(id) && id > 0)));
}

function getTransporter(): nodemailer.Transporter | null {
  if (transporter !== undefined) {
    return transporter;
  }

  if (!EMAIL_ENABLED) {
    transporter = null;
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });

  return transporter;
}

async function claimEventOnce(
  eventKey: string,
  bookingId?: number,
  userId?: number,
): Promise<boolean> {
  const [created] = await db
    .insert(notificationEvents)
    .values({
      eventKey,
      bookingId: bookingId ?? null,
      userId: userId ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: notificationEvents.id });

  return Boolean(created);
}

async function sendPush(userIds: number[], message: RideMessage): Promise<void> {
  if (!PUSH_READY) {
    return;
  }

  const ids = uniqIds(userIds);
  if (ids.length === 0) {
    return;
  }

  const subscriptions = await db
    .select({
      id: notificationSubscriptions.id,
      endpoint: notificationSubscriptions.endpoint,
      p256dh: notificationSubscriptions.p256dh,
      auth: notificationSubscriptions.auth,
    })
    .from(notificationSubscriptions)
    .where(inArray(notificationSubscriptions.userId, ids));

  if (subscriptions.length === 0) {
    return;
  }

  const staleSubscriptionIds: number[] = [];
  const payload = JSON.stringify({
    title: message.title,
    body: message.body,
    url: message.url,
    tag: message.tag,
  });

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        },
        payload,
      );
    } catch (cause) {
      const statusCode = (cause as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        staleSubscriptionIds.push(sub.id);
      }
    }
  }

  if (staleSubscriptionIds.length > 0) {
    await db
      .delete(notificationSubscriptions)
      .where(inArray(notificationSubscriptions.id, staleSubscriptionIds));
  }
}

async function sendEmail(userIds: number[], message: RideMessage): Promise<void> {
  const mailer = getTransporter();
  if (!mailer || !EMAIL_FROM) {
    return;
  }

  const ids = uniqIds(userIds);
  if (ids.length === 0) {
    return;
  }

  const recipients = await db
    .select({ email: users.email })
    .from(users)
    .where(inArray(users.id, ids));

  for (const recipient of recipients) {
    await mailer.sendMail({
      from: EMAIL_FROM,
      to: recipient.email,
      subject: message.emailSubject || message.title,
      text: `${message.body}\n\nOpen: ${absoluteUrl(message.url)}`,
    });
  }
}

async function sendRideMessage(userIds: number[], message: RideMessage): Promise<void> {
  await Promise.all([sendPush(userIds, message), sendEmail(userIds, message)]);
}

async function getBookingContext(bookingId: number): Promise<BookingContext | null> {
  const bookingRows = await db
    .select({
      bookingId: bookings.id,
      pickupAddress: bookings.pickupAddress,
      dropoffAddress: bookings.dropoffAddress,
      scheduledAt: bookings.scheduledAt,
      status: bookings.status,
      pricePence: bookings.pricePence,
      customerId: users.id,
      customerName: users.name,
    })
    .from(bookings)
    .innerJoin(users, eq(bookings.customerId, users.id))
    .where(eq(bookings.id, bookingId))
    .limit(1);

  const booking = bookingRows[0];
  if (!booking) {
    return null;
  }

  const assignments = await db
    .select({
      driverId: driverAssignments.driverId,
      role: driverAssignments.role,
    })
    .from(driverAssignments)
    .where(
      and(
        eq(driverAssignments.bookingId, bookingId),
        eq(driverAssignments.isActive, true),
      ),
    );

  const admins = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"));

  return {
    bookingId: booking.bookingId,
    pickupAddress: booking.pickupAddress,
    dropoffAddress: booking.dropoffAddress,
    scheduledAt: booking.scheduledAt,
    status: booking.status,
    customerId: booking.customerId,
    customerName: booking.customerName,
    pricePence: booking.pricePence,
    activeDriverIds: assignments.map((a) => a.driverId),
    primaryDriverId: assignments.find((a) => a.role === "primary")?.driverId || null,
    backupDriverId: assignments.find((a) => a.role === "backup")?.driverId || null,
    adminIds: admins.map((admin) => admin.id),
  };
}

function rideLabel(ctx: BookingContext): string {
  return `${ctx.pickupAddress} -> ${ctx.dropoffAddress}`;
}

export async function notifyBookingCreated(bookingId: number): Promise<void> {
  const ctx = await getBookingContext(bookingId);
  if (!ctx) {
    return;
  }

  await sendRideMessage([ctx.customerId], {
    title: `${APP_NAME}: Booking Confirmed`,
    emailSubject: `Ride booked for ${formatSchedule(ctx.scheduledAt)}`,
    body: `Your ride is confirmed for ${formatSchedule(ctx.scheduledAt)} (${rideLabel(ctx)}).`,
    url: "/bookings",
    tag: `booking-${ctx.bookingId}`,
  });

  await sendRideMessage(ctx.adminIds, {
    title: `${APP_NAME}: New Ride Booking`,
    emailSubject: `New booking from ${ctx.customerName}`,
    body: `${ctx.customerName} booked ${rideLabel(ctx)} for ${formatSchedule(ctx.scheduledAt)}.`,
    url: "/admin",
    tag: `admin-booking-${ctx.bookingId}`,
  });
}

export async function notifyDriversAssigned(
  bookingId: number,
  primaryDriverId: number,
  backupDriverId: number,
): Promise<void> {
  const ctx = await getBookingContext(bookingId);
  if (!ctx) {
    return;
  }

  await sendRideMessage([primaryDriverId], {
    title: `${APP_NAME}: Primary Driver Assignment`,
    emailSubject: `Primary assignment: ${rideLabel(ctx)}`,
    body: `You are PRIMARY for booking #${ctx.bookingId} at ${formatSchedule(ctx.scheduledAt)}.`,
    url: "/driver",
    tag: `driver-primary-${ctx.bookingId}`,
  });

  await sendRideMessage([backupDriverId], {
    title: `${APP_NAME}: Backup Driver Assignment`,
    emailSubject: `Backup assignment: ${rideLabel(ctx)}`,
    body: `You are BACKUP for booking #${ctx.bookingId} at ${formatSchedule(ctx.scheduledAt)}.`,
    url: "/driver",
    tag: `driver-backup-${ctx.bookingId}`,
  });

  await sendRideMessage([ctx.customerId], {
    title: `${APP_NAME}: Drivers Assigned`,
    emailSubject: `Drivers assigned to booking #${ctx.bookingId}`,
    body: `Drivers have been assigned to your ride on ${formatSchedule(ctx.scheduledAt)}.`,
    url: "/bookings",
    tag: `customer-assigned-${ctx.bookingId}`,
  });
}

export async function notifyBookingStatusChanged(
  bookingId: number,
  status: BookingStatus,
): Promise<void> {
  const ctx = await getBookingContext(bookingId);
  if (!ctx) {
    return;
  }

  const title = `${APP_NAME}: Ride Status Updated`;
  const subject = `Booking #${ctx.bookingId} is now ${formatStatus(status)}`;
  const body = `Booking #${ctx.bookingId} (${rideLabel(ctx)}) is now ${formatStatus(status)}.`;

  await Promise.all([
    sendRideMessage([ctx.customerId], {
      title,
      emailSubject: subject,
      body,
      url: "/bookings",
      tag: `status-customer-${ctx.bookingId}`,
    }),
    sendRideMessage(ctx.activeDriverIds, {
      title,
      emailSubject: subject,
      body,
      url: "/driver",
      tag: `status-driver-${ctx.bookingId}`,
    }),
    sendRideMessage(ctx.adminIds, {
      title,
      emailSubject: subject,
      body,
      url: "/admin",
      tag: `status-admin-${ctx.bookingId}`,
    }),
  ]);
}

export async function notifyBookingCancelled(bookingId: number): Promise<void> {
  const ctx = await getBookingContext(bookingId);
  if (!ctx) {
    return;
  }

  const title = `${APP_NAME}: Ride Cancelled`;
  const subject = `Booking #${ctx.bookingId} was cancelled`;
  const body = `Booking #${ctx.bookingId} (${rideLabel(ctx)}) has been cancelled.`;

  await Promise.all([
    sendRideMessage([ctx.customerId], {
      title,
      emailSubject: subject,
      body,
      url: "/bookings",
      tag: `cancelled-customer-${ctx.bookingId}`,
    }),
    sendRideMessage(ctx.activeDriverIds, {
      title,
      emailSubject: subject,
      body,
      url: "/driver",
      tag: `cancelled-driver-${ctx.bookingId}`,
    }),
    sendRideMessage(ctx.adminIds, {
      title,
      emailSubject: subject,
      body,
      url: "/admin",
      tag: `cancelled-admin-${ctx.bookingId}`,
    }),
  ]);
}

export async function notifyDriverWatchdogWarning(
  bookingId: number,
  primaryDriverId: number,
  missedWindows: number,
  fallbackWindows: number,
): Promise<void> {
  const key = `watchdog-warning:${bookingId}:${primaryDriverId}:${missedWindows}`;
  const shouldSend = await claimEventOnce(key, bookingId, primaryDriverId);
  if (!shouldSend) {
    return;
  }

  const ctx = await getBookingContext(bookingId);
  if (!ctx) {
    return;
  }

  await sendRideMessage(uniqIds([primaryDriverId, ...ctx.adminIds, ...(ctx.backupDriverId ? [ctx.backupDriverId] : [])]), {
    title: `${APP_NAME}: Driver Heartbeat Warning`,
    emailSubject: `Heartbeat warning for booking #${bookingId}`,
    body: `Primary driver heartbeat missed ${missedWindows}/${fallbackWindows} windows for booking #${bookingId}.`,
    url: "/admin",
    tag: `watchdog-warning-${bookingId}`,
  });
}

export async function notifyDriverFallbackActivated(
  bookingId: number,
  oldPrimaryDriverId: number,
  newPrimaryDriverId: number,
): Promise<void> {
  const key = `watchdog-fallback:${bookingId}:${oldPrimaryDriverId}:${newPrimaryDriverId}`;
  const shouldSend = await claimEventOnce(key, bookingId);
  if (!shouldSend) {
    return;
  }

  const ctx = await getBookingContext(bookingId);
  if (!ctx) {
    return;
  }

  await sendRideMessage(
    uniqIds([
      ctx.customerId,
      ...ctx.adminIds,
      oldPrimaryDriverId,
      newPrimaryDriverId,
    ]),
    {
      title: `${APP_NAME}: Backup Driver Promoted`,
      emailSubject: `Driver fallback activated for booking #${bookingId}`,
      body: `Backup driver was promoted to PRIMARY for booking #${bookingId}.`,
      url: "/admin",
      tag: `watchdog-fallback-${bookingId}`,
    },
  );
}

export async function notifyWatchdogResult(result: DriverWatchdogResult): Promise<void> {
  await Promise.all([
    ...result.warnings.map((warning) =>
      notifyDriverWatchdogWarning(
        warning.bookingId,
        warning.primaryDriverId,
        warning.missedWindows,
        result.config.fallbackWindows,
      ),
    ),
    ...result.fallbacks.map((fallback) =>
      notifyDriverFallbackActivated(
        fallback.bookingId,
        fallback.oldPrimaryDriverId,
        fallback.newPrimaryDriverId,
      ),
    ),
  ]);
}

export async function processDueRideReminders(
  windowStart: Date,
  windowEnd: Date,
): Promise<number> {
  const reminderMinutes = String(process.env.RIDE_REMINDER_MINUTES || "120,60,15")
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isInteger(v) && v > 0)
    .sort((a, b) => b - a);

  if (reminderMinutes.length === 0) {
    return 0;
  }

  let sentCount = 0;

  for (const minutes of reminderMinutes) {
    const from = new Date(windowStart.getTime() + minutes * 60 * 1000);
    const to = new Date(windowEnd.getTime() + minutes * 60 * 1000);

    const dueBookings = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(
        and(
          inArray(bookings.status, ["scheduled", "assigned"]),
          gte(bookings.scheduledAt, from),
          lte(bookings.scheduledAt, to),
        ),
      );

    for (const booking of dueBookings) {
      const eventKey = `ride-reminder:${booking.id}:${minutes}`;
      const shouldSend = await claimEventOnce(eventKey, booking.id);
      if (!shouldSend) {
        continue;
      }

      const ctx = await getBookingContext(booking.id);
      if (!ctx) {
        continue;
      }

      const title = `${APP_NAME}: Ride Reminder`;
      const subject = `Ride starts in ${minutes} minutes`;
      const body = `Booking #${ctx.bookingId} starts in ${minutes} minutes (${rideLabel(ctx)}). Fare ${formatMoney(ctx.pricePence)}.`;

      await Promise.all([
        sendRideMessage([ctx.customerId], {
          title,
          emailSubject: subject,
          body,
          url: "/bookings",
          tag: `ride-reminder-customer-${ctx.bookingId}-${minutes}`,
        }),
        sendRideMessage(ctx.activeDriverIds, {
          title,
          emailSubject: subject,
          body,
          url: "/driver",
          tag: `ride-reminder-driver-${ctx.bookingId}-${minutes}`,
        }),
      ]);

      sentCount += 1;
    }
  }

  return sentCount;
}

export function getPublicVapidKey(): string | null {
  return VAPID_PUBLIC_KEY || null;
}

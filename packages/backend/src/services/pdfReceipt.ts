// Branded PDF receipt for booking confirmations + ride completions.
//
// Pure rendering: takes a booking + line items, returns a Buffer the
// email service can attach. Stays dependency-light (pdfkit only) so we
// don't need a headless browser in the runtime image.

import PDFDocument from "pdfkit";
import { config } from "../config";

export type ReceiptKind = "confirmation" | "final";

export interface ReceiptInput {
  kind: ReceiptKind;
  booking: {
    id: number;
    pickupAddress: string;
    dropoffAddress: string;
    scheduledAt: Date;
    pricePence: number;
    discountPence: number;
    waitingFeePence: number;
    cancellationFeePence: number;
    paymentMethod: "card" | "cash";
    depositPence: number;
    balanceDuePence: number;
    cashCollectedAt: Date | null;
    vehicleClass: string;
  };
  customer: { name: string; email: string };
}

function gbp(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export function renderReceiptPdf(input: ReceiptInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const { booking, customer, kind } = input;

    // Header
    doc
      .fontSize(20)
      .fillColor("#131313")
      .text(config.app.name, { continued: false });
    doc
      .fontSize(10)
      .fillColor("#7d8082")
      .text(
        kind === "confirmation"
          ? "Booking confirmation"
          : "Final ride receipt",
      );
    doc.moveDown();

    // Booking meta
    doc
      .fontSize(11)
      .fillColor("#131313")
      .text(`Booking #${booking.id}`)
      .text(`Issued: ${new Date().toLocaleString("en-GB")}`)
      .text(`Pickup: ${booking.scheduledAt.toLocaleString("en-GB")}`)
      .text(`Vehicle: ${booking.vehicleClass}`)
      .text(`Payment method: ${booking.paymentMethod.toUpperCase()}`);
    doc.moveDown();

    // Customer
    doc
      .fontSize(10)
      .fillColor("#7d8082")
      .text("CUSTOMER")
      .fontSize(11)
      .fillColor("#131313")
      .text(customer.name)
      .text(customer.email);
    doc.moveDown();

    // Route
    doc
      .fontSize(10)
      .fillColor("#7d8082")
      .text("ROUTE")
      .fontSize(11)
      .fillColor("#131313")
      .text(`From: ${booking.pickupAddress}`)
      .text(`To:   ${booking.dropoffAddress}`);
    doc.moveDown();

    // Charges
    doc.fontSize(10).fillColor("#7d8082").text("CHARGES");
    const lines: Array<[string, string]> = [
      ["Fare", gbp(booking.pricePence)],
    ];
    if (booking.discountPence > 0) {
      lines.push(["Discount", `- ${gbp(booking.discountPence)}`]);
    }
    if (kind === "final") {
      if (booking.waitingFeePence > 0) {
        lines.push(["Waiting fee", gbp(booking.waitingFeePence)]);
      }
      if (booking.cancellationFeePence > 0) {
        lines.push(["Cancellation fee", gbp(booking.cancellationFeePence)]);
      }
    }
    const netPence =
      booking.pricePence -
      booking.discountPence +
      (kind === "final"
        ? booking.waitingFeePence + booking.cancellationFeePence
        : 0);
    lines.push(["Total", gbp(netPence)]);

    if (booking.paymentMethod === "cash") {
      lines.push(["Deposit charged (card)", gbp(booking.depositPence)]);
      lines.push([
        booking.cashCollectedAt ? "Balance (collected)" : "Balance due (cash)",
        gbp(booking.balanceDuePence),
      ]);
    }

    doc.fontSize(11).fillColor("#131313");
    for (const [label, value] of lines) {
      const y = doc.y;
      doc.text(label, 50, y, { width: 250 });
      doc.text(value, 300, y, { width: 250, align: "right" });
      doc.moveDown(0.4);
    }
    doc.moveDown();

    // Footer
    doc
      .fontSize(9)
      .fillColor("#7d8082")
      .text(
        kind === "confirmation"
          ? "This is a booking confirmation. A final receipt will be issued after the ride is completed."
          : "Thank you for riding with us.",
        { align: "center" },
      );

    doc.end();
  });
}

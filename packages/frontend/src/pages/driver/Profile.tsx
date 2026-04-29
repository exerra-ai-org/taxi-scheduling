import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  getMyProfile,
  updateMyProfile,
  uploadProfilePicture,
  type DriverSelfProfile,
} from "../../api/drivers";
import { ApiError } from "../../api/client";
import { useToast } from "../../context/ToastContext";
import { useDriverGuard } from "../../components/DriverGuard";
import { useConfirm } from "../../hooks/useConfirm";
import ConfirmDialog from "../../components/ConfirmDialog";
import { SkeletonCard } from "../../components/Skeleton";
import { IconUser, IconCar, IconStar } from "../../components/icons";

const VEHICLE_CLASSES = [
  { value: "regular", label: "Regular" },
  { value: "comfort", label: "Comfort" },
  { value: "max", label: "Max" },
] as const;

export default function DriverProfile() {
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const guard = useDriverGuard();
  const { confirm, dialogProps } = useConfirm();
  const locState = location.state as {
    incomplete?: boolean;
    missing?: string[];
  } | null;
  const fileRef = useRef<HTMLInputElement>(null);

  const [driver, setDriver] = useState<DriverSelfProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Form state
  const [profilePictureUrl, setProfilePictureUrl] = useState("");
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleYear, setVehicleYear] = useState("");
  const [vehicleColor, setVehicleColor] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [vehicleClass, setVehicleClass] = useState<
    "regular" | "comfort" | "max" | ""
  >("");
  const [bio, setBio] = useState("");

  function populate(d: DriverSelfProfile) {
    setDriver(d);
    setProfilePictureUrl(d.profilePictureUrl ?? "");
    setPreviewUrl(d.profilePictureUrl ?? null);
    setVehicleMake(d.profile?.vehicleMake ?? "");
    setVehicleModel(d.profile?.vehicleModel ?? "");
    setVehicleYear(d.profile?.vehicleYear?.toString() ?? "");
    setVehicleColor(d.profile?.vehicleColor ?? "");
    setLicensePlate(d.profile?.licensePlate ?? "");
    setVehicleClass((d.profile?.vehicleClass as typeof vehicleClass) ?? "");
    setBio(d.profile?.bio ?? "");
  }

  useEffect(() => {
    document.title = "My profile";
    getMyProfile()
      .then(({ driver: d }) => populate(d))
      .catch(() => toast.error("Could not load profile"))
      .finally(() => setLoading(false));
  }, []);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Local preview immediately
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setUploading(true);
    try {
      const url = await uploadProfilePicture(file);
      setProfilePictureUrl(url);
      toast.success("Photo uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
      setPreviewUrl(driver?.profilePictureUrl ?? null);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const ok = await confirm({
      title: "Save profile",
      message: "Save these changes to your profile?",
      confirmLabel: "Save",
    });
    if (!ok) return;
    setSaving(true);
    try {
      await updateMyProfile({
        ...(profilePictureUrl ? { profilePictureUrl } : {}),
        ...(vehicleMake ? { vehicleMake } : {}),
        ...(vehicleModel ? { vehicleModel } : {}),
        ...(vehicleYear ? { vehicleYear: Number(vehicleYear) } : {}),
        ...(vehicleColor ? { vehicleColor } : {}),
        ...(licensePlate ? { licensePlate } : {}),
        ...(vehicleClass ? { vehicleClass } : {}),
        ...(bio ? { bio } : {}),
      });
      toast.success("Profile saved");
      const isComplete = await guard?.recheck();
      const { driver: d } = await getMyProfile();
      populate(d);
      if (isComplete) navigate("/driver", { replace: true });
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Could not save profile",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <p className="section-label">Driver</p>
          <h1 className="page-title">My profile</h1>
        </div>
      </div>

      {locState?.incomplete && (
        <div className="alert alert-warning" role="alert">
          {locState.missing && locState.missing.length > 0
            ? `To access your rides, please add: ${locState.missing.join(", ")}.`
            : "Please complete your profile before you can access your rides."}
        </div>
      )}

      {/* Current profile summary */}
      {driver && (
        <div className="glass-card p-4 flex items-start gap-4">
          <div className="relative shrink-0">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={driver.name}
                className="h-14 w-14 rounded-full object-cover border border-[var(--color-border)]"
              />
            ) : (
              <span className="h-14 w-14 rounded-full bg-[var(--color-surface-raised)] flex items-center justify-center border border-[var(--color-border)]">
                <IconUser className="h-6 w-6" />
              </span>
            )}
            {uploading && (
              <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                <span className="text-white text-[10px]">…</span>
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="body-copy font-medium text-[var(--color-dark)]">
              {driver.name}
            </div>
            <div className="caption-copy">{driver.email}</div>
            {driver.avgRating != null && (
              <div className="caption-copy mt-1 inline-flex items-center gap-1">
                <IconStar className="h-3.5 w-3.5 text-yellow-400" />
                <span className="font-medium">{driver.avgRating}</span>
                <span className="text-[var(--color-muted)]">
                  ({driver.totalReviews} reviews)
                </span>
              </div>
            )}
            {driver.profile && (
              <div className="caption-copy mt-1 inline-flex items-center gap-1.5 text-[var(--color-mid)]">
                <IconCar className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {[
                    driver.profile.vehicleYear,
                    driver.profile.vehicleMake,
                    driver.profile.vehicleModel,
                  ]
                    .filter(Boolean)
                    .join(" ") || "No vehicle set"}
                  {driver.profile.licensePlate
                    ? ` · ${driver.profile.licensePlate}`
                    : ""}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5">
        {/* Photo */}
        <div className="glass-card p-4 space-y-3">
          <p className="section-label">/ Photo</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={handleFileChange}
          />
          <div className="flex items-center gap-3">
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Preview"
                className="h-12 w-12 rounded-full object-cover border border-[var(--color-border)]"
              />
            )}
            <button
              type="button"
              className="btn-secondary"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading
                ? "Uploading…"
                : previewUrl
                  ? "Change photo"
                  : "Upload photo"}
            </button>
            <span className="caption-copy text-[var(--color-muted)]">
              JPEG, PNG, WebP · max 5 MB
            </span>
          </div>
        </div>

        {/* Vehicle */}
        <div className="glass-card p-4 space-y-4">
          <p className="section-label">/ Vehicle</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="form-group">
              <label className="form-label">Make</label>
              <input
                className="form-input"
                placeholder="Toyota"
                value={vehicleMake}
                onChange={(e) => setVehicleMake(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Model</label>
              <input
                className="form-input"
                placeholder="Camry"
                value={vehicleModel}
                onChange={(e) => setVehicleModel(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Year</label>
              <input
                className="form-input"
                type="number"
                placeholder="2022"
                min={1990}
                max={2100}
                value={vehicleYear}
                onChange={(e) => setVehicleYear(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Color</label>
              <input
                className="form-input"
                placeholder="Black"
                value={vehicleColor}
                onChange={(e) => setVehicleColor(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">License plate</label>
            <input
              className="form-input font-mono uppercase"
              placeholder="AB12 CDE"
              value={licensePlate}
              onChange={(e) => setLicensePlate(e.target.value.toUpperCase())}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Vehicle class</label>
            <select
              className="form-input"
              value={vehicleClass}
              onChange={(e) =>
                setVehicleClass(e.target.value as typeof vehicleClass)
              }
            >
              <option value="">Select class</option>
              {VEHICLE_CLASSES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Bio */}
        <div className="glass-card p-4 space-y-4">
          <p className="section-label">/ About</p>
          <div className="form-group">
            <label className="form-label">Bio</label>
            <textarea
              className="form-input resize-none"
              rows={3}
              placeholder="A short intro about yourself…"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />
          </div>
        </div>

        <button
          type="submit"
          className="btn-primary w-full"
          disabled={saving || uploading}
        >
          {saving ? "Saving…" : "Save profile"}
        </button>
      </form>
      {dialogProps && <ConfirmDialog {...dialogProps} />}
    </div>
  );
}

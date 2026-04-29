import { useEffect, useState } from "react";
import { updateProfile, changePassword } from "../api/auth";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useConfirm } from "../hooks/useConfirm";
import ConfirmDialog from "../components/ConfirmDialog";

export default function ProfilePage() {
  const { user, setUserData } = useAuth();
  const toast = useToast();
  const { confirm, dialogProps } = useConfirm();

  // Details form
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [savingDetails, setSavingDetails] = useState(false);

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordDone, setPasswordDone] = useState(false);

  useEffect(() => {
    document.title = "My account";
  }, []);

  async function handleSaveDetails(e: React.FormEvent) {
    e.preventDefault();
    const ok = await confirm({
      title: "Save changes",
      message: "Update your name and phone number?",
      confirmLabel: "Save",
    });
    if (!ok) return;
    setSavingDetails(true);
    try {
      const { user: updated } = await updateProfile({
        name: name.trim() || undefined,
        phone: phone.trim() || null,
      });
      setUserData(updated);
      toast.success("Details updated");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setSavingDetails(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError("");
    setPasswordDone(false);
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }
    const ok = await confirm({
      title: "Change password",
      message: "Are you sure you want to change your password?",
      confirmLabel: "Change password",
    });
    if (!ok) return;
    setSavingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPasswordDone(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password changed");
    } catch (err) {
      setPasswordError(
        err instanceof ApiError ? err.message : "Could not change password",
      );
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="page-stack mx-auto max-w-[640px]">
      <div className="page-header">
        <div>
          <p className="section-label">Account</p>
          <h1 className="page-title">{user?.name}</h1>
        </div>
      </div>

      {/* Details */}
      <div className="glass-card p-5 space-y-4">
        <p className="section-label">/ Details</p>
        <form onSubmit={handleSaveDetails} className="space-y-4">
          <div className="form-group">
            <label className="form-label">Full name</label>
            <input
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={1}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="form-input opacity-60"
              value={user?.email ?? ""}
              readOnly
              tabIndex={-1}
            />
            <p className="caption-copy mt-1 text-[var(--color-muted)]">
              Email cannot be changed here.
            </p>
          </div>
          <div className="form-group">
            <label className="form-label">Phone</label>
            <input
              type="tel"
              className="form-input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+44 7700 900000"
            />
          </div>
          <button
            type="submit"
            className="btn-primary w-full"
            disabled={savingDetails}
          >
            {savingDetails ? "Saving…" : "Save details"}
          </button>
        </form>
      </div>

      {/* Password — only shown if they have a password-based account */}
      <div className="glass-card p-5 space-y-4">
        <p className="section-label">/ Password</p>
        {passwordDone && (
          <div className="alert alert-success">
            Password changed successfully.
          </div>
        )}
        {passwordError && (
          <div className="alert alert-error">{passwordError}</div>
        )}
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div className="form-group">
            <label className="form-label">Current password</label>
            <input
              type="password"
              className="form-input"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <div className="form-group">
            <label className="form-label">New password</label>
            <input
              type="password"
              className="form-input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Confirm new password</label>
            <input
              type="password"
              className="form-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <button
            type="submit"
            className="btn-secondary w-full"
            disabled={savingPassword}
          >
            {savingPassword ? "Changing…" : "Change password"}
          </button>
        </form>
      </div>

      {/* Read-only info */}
      <div className="glass-card p-5 space-y-2">
        <p className="section-label">/ Account info</p>
        <dl className="ride-detail-grid">
          <div className="ride-detail-grid-cell">
            <dt>ROLE</dt>
            <dd className="capitalize">{user?.role}</dd>
          </div>
        </dl>
      </div>
      {dialogProps && <ConfirmDialog {...dialogProps} />}
    </div>
  );
}

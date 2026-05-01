import Modal from "../Modal";
import AuthForm from "./AuthForm";
import type { AuthUser } from "../../api/auth";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (user: AuthUser) => void;
  initialEmail?: string;
}

/**
 * In-page sign-in modal. Hosts AuthForm and closes itself on a successful
 * sign-in. Used during the booking flow so the user does not lose their
 * pickup / dropoff / vehicle / scheduled-time state to a navigation.
 */
export default function SignInModal({
  isOpen,
  onClose,
  onSuccess,
  initialEmail,
}: Props) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Sign in to continue"
      size="md"
    >
      <AuthForm
        initialEmail={initialEmail}
        showResetLink={false}
        showHeader={false}
        onSuccess={(user) => {
          onSuccess?.(user);
          onClose();
        }}
      />
    </Modal>
  );
}

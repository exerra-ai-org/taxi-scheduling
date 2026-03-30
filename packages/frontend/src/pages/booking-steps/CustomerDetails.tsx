import { useAuth } from "../../context/AuthContext";
import { Link } from "react-router-dom";

interface Props {
  onNext: () => void;
  onBack: () => void;
}

export default function CustomerDetails({ onNext, onBack }: Props) {
  const { user } = useAuth();

  if (!user) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Your Details</h2>
        <div className="bg-yellow-50 text-yellow-800 px-4 py-3 rounded text-sm">
          Please log in to continue with your booking.
        </div>
        <Link
          to="/login"
          className="block w-full text-center bg-blue-600 text-white py-2 rounded font-medium hover:bg-blue-700"
        >
          Login to Continue
        </Link>
        <button
          onClick={onBack}
          className="w-full border border-gray-300 text-gray-700 py-2 rounded hover:bg-gray-50"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Confirm Your Details</h2>

      <div className="bg-white border rounded-lg p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Name</span>
          <span className="font-medium">{user.name}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Email</span>
          <span className="font-medium">{user.email}</span>
        </div>
        {user.phone && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Phone</span>
            <span className="font-medium">{user.phone}</span>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 border border-gray-300 text-gray-700 py-2 rounded hover:bg-gray-50"
        >
          Back
        </button>
        <button
          onClick={onNext}
          className="flex-1 bg-blue-600 text-white py-2 rounded font-medium hover:bg-blue-700"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

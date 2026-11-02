import { useApp } from "../context/AppContext";
import { Smartphone, LogOut } from "lucide-react";

// Shop-floor work (picking up work orders and logging production) now lives in
// the INVIU mobile app. The web app is for managers. If an operator lands here,
// point them to the app rather than showing the manager dashboard.
export const OperatorPage = () => {
  const { user, logout } = useApp();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-5">
          <Smartphone className="w-8 h-8 text-blue-600" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">
          Hi {user?.displayName || user?.username}
        </h1>
        <p className="text-slate-600 mt-2">
          Shop-floor work has moved to the <span className="font-semibold">INVIU mobile app</span>.
          Open the app on your phone to pick up work orders and log production.
        </p>
        <p className="text-sm text-slate-500 mt-4">
          The web dashboard is for managers.
        </p>
        <button
          onClick={logout}
          className="mt-6 inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg transition"
        >
          <LogOut className="w-4 h-4" />
          Log out
        </button>
      </div>
    </div>
  );
};

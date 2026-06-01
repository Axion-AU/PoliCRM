import "./index.css";
import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "@shared/components/ErrorBoundary";
import { ProtectedRoute } from "@modules/Auth";
import { Layout } from "@modules/AppShell";

const LandingPage = lazy(() =>
  import("@modules/Landing").then((module) => ({
    default: module.LandingPage,
  })),
);
const WarRoom = lazy(() =>
  import("@modules/WarRoom").then((module) => ({ default: module.WarRoomPage })),
);
const Login = lazy(() =>
  import("@modules/Auth").then((module) => ({ default: module.LoginPage })),
);
const Dashboard = lazy(() =>
  import("@modules/Dashboard").then((module) => ({ default: module.DashboardPage })),
);
const Queue = lazy(() =>
  import("@modules/Queue").then((module) => ({ default: module.QueuePage })),
);

function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Suspense
          fallback={
            <div className="flex items-center justify-center min-h-screen bg-slate-950 text-slate-200">
              <div className="animate-pulse">Loading...</div>
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<Login />} />

            {/* Protected Routes with Sidebar Layout */}
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="/war-room" element={<WarRoom />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/queue" element={<Queue />} />
            </Route>
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;

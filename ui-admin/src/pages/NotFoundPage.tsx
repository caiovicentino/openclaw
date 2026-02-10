import { FileQuestion } from "lucide-react";
import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="text-center">
        <FileQuestion className="mx-auto h-16 w-16 text-slate-300" />
        <h1 className="mt-4 text-4xl font-bold text-slate-900">404</h1>
        <p className="mt-2 text-lg text-slate-600">Page not found</p>
        <p className="mt-1 text-sm text-slate-500">
          The page you are looking for does not exist or has been moved.
        </p>
        <Link
          to="/dashboard"
          className="mt-6 inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}

import React, { ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";

interface Props {
  children: ReactNode;
  onError?: (payload: { error: Error; errorInfo: ErrorInfo | null }) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

// LAYER: Global Safety Net
// Catches render errors in the React tree to prevent white screen of death.
class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log to console (and ideally to a logging service)
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ errorInfo });
    try {
      this.props.onError?.({ error, errorInfo });
    } catch {
      // ignore error log failures
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-full flex-col items-center justify-center bg-gray-900 text-white p-6">
          <div className="max-w-md rounded-xl bg-gray-800 p-8 shadow-2xl border border-red-500/30">
            <div className="flex items-center gap-3 text-red-400 mb-4">
              <AlertTriangle size={32} />
              <h1 className="text-xl font-bold">Application Error</h1>
            </div>
            <p className="mb-4 text-gray-300">
              Something went wrong in the rendering process. We've logged the error.
            </p>
            <div className="bg-black/50 p-4 rounded-md font-mono text-xs text-red-200 mb-6 overflow-auto max-h-32">
              {this.state.error?.toString()}
            </div>
            <button
              onClick={this.handleReload}
              className="flex items-center justify-center gap-2 w-full rounded-lg bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 transition-colors"
            >
              <RefreshCcw size={18} />
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

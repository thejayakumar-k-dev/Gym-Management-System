import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Delete, CheckCircle, AlertCircle, Maximize, Minimize } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

type AttendanceType = "success" | "warning" | "expired" | "error" | null;

interface AttendanceResult {
  type: AttendanceType;
  message: string;
  student?: {
    name: string;
    registerNumber: string;
    expiryDate?: string;
  };
  daysLeft?: number;
  isExpired?: boolean;
}

interface AlertData extends AttendanceResult {
  enteredRegisterNumber?: string;
}

interface ErrorResponse {
  type: "error";
  error: string;
}

export default function AttendancePad() {
  const [registerNumber, setRegisterNumber] = useState("");
  const [alert, setAlert] = useState<AlertData | null>(null);
  const [error, setError] = useState<ErrorResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Auto-dismiss alert after delay
  useEffect(() => {
    if (!alert) {
      return;
    }

    const dismissTime = alert.type === "error" ? 5000 : 8000;
    const timer = setTimeout(() => {
      setAlert(null);
      setRegisterNumber("");
    }, dismissTime);

    return () => clearTimeout(timer);
  }, [alert]);

  // Keyboard support
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (loading) return;

      if (e.key >= "0" && e.key <= "9") {
        setRegisterNumber((prev) => prev + e.key);
        setAlert(null);
        setError(null);
      } else if (e.key === "Backspace") {
        setRegisterNumber((prev) => prev.slice(0, -1));
        setAlert(null);
        setError(null);
      } else if (e.key === "Delete" || e.key === "Escape") {
        handleClearAll();
      } else if (e.key === "Enter") {
        handleSubmit();
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [loading]);

  const attendanceMutation = useMutation({
    mutationFn: async (regNo: string) => {
      const trimmedRegNo = regNo.trim();
      if (!trimmedRegNo) {
        throw new Error(JSON.stringify({ type: "error", error: "Register number is required" }));
      }

      const response = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registerNumber: trimmedRegNo }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(JSON.stringify(data));
      }
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      
      setLoading(false);
      setError(null);
      setAlert(data);
    },
    onError: (error: any) => {
      try {
        const errorData = JSON.parse(error.message);
        setAlert({
          type: errorData.type || "error",
          message: errorData.message || errorData.error || "Failed to process attendance",
          student: errorData.student,
          daysLeft: errorData.daysLeft,
          isExpired: errorData.isExpired,
          enteredRegisterNumber: registerNumber,
        });
      } catch {
        setAlert({
          type: "error",
          message: "Failed to process attendance",
          enteredRegisterNumber: registerNumber,
        });
      }
      setLoading(false);
    },
  });

  const handleNumberClick = (num: string) => {
    setRegisterNumber((prev) => prev + num);
    setAlert(null);
    setError(null);
  };

  const handleClearLast = () => {
    setRegisterNumber((prev) => prev.slice(0, -1));
    setAlert(null);
    setError(null);
  };

  const handleClearAll = () => {
    setRegisterNumber("");
    setAlert(null);
    setError(null);
  };

  const handleSubmit = () => {
    if (!registerNumber.trim()) return;
    setLoading(true);
    setError(null);
    attendanceMutation.mutate(registerNumber);
  };

  const numbers = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

  const getAlertStyle = (type: AttendanceType) => {
    switch (type) {
      case "success":
        return {
          borderColor: "border-green-500",
          textColor: "text-green-400",
          icon: <CheckCircle className="w-5 h-5 text-green-500" />,
        };
      case "warning":
        return {
          borderColor: "border-yellow-500",
          textColor: "text-yellow-400",
          icon: <AlertCircle className="w-5 h-5 text-yellow-500" />,
        };
      case "expired":
        return {
          borderColor: "border-red-500",
          textColor: "text-red-400",
          icon: <AlertCircle className="w-5 h-5 text-red-500" />,
        };
      case "error":
        return {
          borderColor: "border-red-500",
          textColor: "text-red-400",
          icon: <AlertCircle className="w-5 h-5 text-red-500" />,
        };
      default:
        return {
          borderColor: "border-gray-500",
          textColor: "text-gray-400",
          icon: <AlertCircle className="w-5 h-5 text-gray-500" />,
        };
    }
  };

  // Show error page if general error
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center relative">
            <h1 className="text-4xl font-bold text-white mb-2">Attendance</h1>
            <p className="text-slate-400">Enter your register number</p>
          </div>

          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-8">
              <div className="bg-red-900/20 border-2 border-red-500 rounded-lg p-4 flex items-center gap-2">
                <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0" />
                <p className="font-bold text-red-400">{error.error}</p>
              </div>

              <div className="mt-6">
                <Button
                  onClick={() => setError(null)}
                  className="w-full bg-red-600 hover:bg-red-700 text-white"
                  data-testid="button-dismiss-error"
                >
                  Try Again
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Show keypad with inline alerts
  return (
    <div
      className={cn(
        "min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4",
        isFullscreen && "fixed inset-0 z-50"
      )}
    >
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center relative">
          <Button
            onClick={() => setIsFullscreen(!isFullscreen)}
            variant="ghost"
            className="absolute right-0 top-0 text-white hover:bg-slate-800"
            size="icon"
            data-testid="button-fullscreen-toggle"
          >
            {isFullscreen ? (
              <Minimize className="w-5 h-5" />
            ) : (
              <Maximize className="w-5 h-5" />
            )}
          </Button>
          <h1 className="text-4xl font-bold text-white mb-2">Attendance</h1>
          <p className="text-slate-400">Enter your register number</p>
        </div>

        {/* Display */}
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-8">
            <div className="bg-slate-900 rounded-lg p-6 min-h-[80px] flex items-center justify-center">
              <p
                className="text-4xl font-mono text-white tracking-wider"
                data-testid="display-register-number"
              >
                {registerNumber || "___"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Inline Alert */}
        {alert && (
          <div className={cn("border-2 rounded-lg p-4 space-y-2", getAlertStyle(alert.type).borderColor)}>
            <div className="flex items-center gap-2">
              {getAlertStyle(alert.type).icon}
              <p className={cn("font-bold", getAlertStyle(alert.type).textColor)}>
                {alert.message}
              </p>
            </div>

            {/* Details */}
            {alert.type === "error" && alert.enteredRegisterNumber ? (
              <div className="text-sm text-slate-300 ml-7">
                <p>Register Number: {alert.enteredRegisterNumber}</p>
              </div>
            ) : alert.student ? (
              <div className="text-sm text-slate-300 ml-7 space-y-1">
                <p>Name: {alert.student.name}</p>
                <p>Date: {format(new Date(), "MMMM d, yyyy")}</p>
                {alert.type === "success" && <p>Time In: {format(new Date(), "h:mm a")}</p>}
                <p>Days Left: <span className={!alert.isExpired ? "text-green-400" : "text-red-400"}>{alert.daysLeft} days</span></p>
                <p>Status: <span className={!alert.isExpired ? "text-green-400" : "text-red-400"}>{alert.isExpired ? "EXPIRED" : "ACTIVE"}</span></p>
              </div>
            ) : null}
          </div>
        )}

        {/* Number Pad */}
        <div className="grid grid-cols-3 gap-3">
          {numbers.map((num) => (
            <Button
              key={num}
              onClick={() => handleNumberClick(num)}
              className="h-20 text-3xl font-bold bg-slate-700 hover:bg-slate-600 text-white border-2 border-slate-600 disabled:opacity-50"
              disabled={loading}
              data-testid={`button-number-${num}`}
            >
              {num}
            </Button>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <Button
            onClick={handleClearLast}
            className="h-16 text-lg font-medium bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50"
            disabled={loading}
            data-testid="button-clear-last"
          >
            <Delete className="w-5 h-5 mr-2" />
            Clear Last
          </Button>
          <Button
            onClick={handleClearAll}
            className="h-16 text-lg font-medium bg-slate-700 hover:bg-slate-600 text-white disabled:opacity-50"
            disabled={loading}
            data-testid="button-clear-all"
          >
            Clear All
          </Button>
        </div>

        <Button
          onClick={handleSubmit}
          className="w-full h-16 text-xl font-bold bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
          disabled={!registerNumber || loading}
          data-testid="button-submit-attendance"
        >
          {loading ? "Processing..." : "Submit"}
        </Button>
      </div>
    </div>
  );
}

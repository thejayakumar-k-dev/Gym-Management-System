import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { authHeaders } from "@/lib/queryClient";
import { formatDateLong } from "@/lib/format";
import { isReadOnlyMode, useReadOnly } from "@/lib/read-only";
import { Check, AlertTriangle, CheckCircle } from "lucide-react";
import type { Student } from "@shared/schema";

type PreviewState = null | "success" | "expired" | "already_marked" | "error";

interface PreviewData {
  type: PreviewState;
  message: string;
  student?: {
    name: string;
    registerNumber: string;
    expiryDate?: string;
  };
  daysLeft?: number;
  isExpired?: boolean;
  timeIn?: string;
}

export default function AttendancePad() {
  const [registerNumber, setRegisterNumber] = useState("");
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  // Admin viewing this vendor's panel in Read Only mode — no check-ins.
  const readOnly = useReadOnly();

  const { data: students } = useQuery<Student[]>({
    queryKey: ["/api/students"],
  });

  // Keep the cursor parked in the member ID box: focus on mount, after every
  // keypad tap, when the window/tab regains focus, and whenever the pad area
  // itself is touched — so the on-screen keyboard never ends up detached.
  const inputRef = useRef<HTMLInputElement>(null);
  const focusInput = () => inputRef.current?.focus();

  useEffect(() => {
    focusInput();
    window.addEventListener("focus", focusInput);
    return () => window.removeEventListener("focus", focusInput);
  }, []);

  // When the result screen clears (auto-reset after 4s) the pad comes back —
  // grab focus again so the next member can just start typing.
  useEffect(() => {
    if (!previewData) focusInput();
  }, [previewData]);

  // Clicking anywhere else — sidebar on the left, empty space on the right,
  // header buttons — must never steal the cursor. Re-focus after the browser
  // has finished its own focus handling (hence rAF), and skip when the input
  // already has it so the caret is never reset while typing.
  useEffect(() => {
    const refocus = () => {
      window.requestAnimationFrame(() => {
        if (document.activeElement !== inputRef.current) inputRef.current?.focus();
      });
    };
    document.addEventListener("pointerdown", refocus);
    document.addEventListener("focusin", refocus);
    return () => {
      document.removeEventListener("pointerdown", refocus);
      document.removeEventListener("focusin", refocus);
    };
  }, []);

  const handleNumberClick = (num: string) => {
    setRegisterNumber((prev) => prev + num);
    focusInput();
  };

  const handleSubmit = async () => {
    if (!registerNumber.trim()) {
      toast({
        title: "Please enter a member ID",
        variant: "destructive",
      });
      return;
    }

    const student = students?.find((s) => s.registerNo === registerNumber);
    if (!student) {
      toast({
        title: "Student not found",
        variant: "destructive",
      });
      return;
    }

    if (isReadOnlyMode()) {
      toast({
        title: "Read-only mode — changes are disabled",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const now = new Date();
      const timeInStr = now.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });

      const response = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({
          registerNumber: student.registerNo,
        }),
      });

      const data = await response.json();

      console.log("API Response:", data);

      // Set preview data with timeIn
      setPreviewData({
        ...data,
        timeIn: timeInStr,
      });

      // Auto-clear after 4 seconds
      setTimeout(() => {
        setRegisterNumber("");
        setPreviewData(null);
      }, 4000);
    } catch (error) {
      console.error("Error:", error);
      toast({
        title: "Failed to record attendance",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const numbers = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

  const getPreviewStyles = (type: PreviewState) => {
    switch (type) {
      case "success":
        return {
          borderColor: "border-green-500",
          bgColor: "bg-green-50 dark:bg-slate-900",
          iconColor: "text-green-500",
          textColor: "text-green-700 dark:text-green-300",
          messageColor: "text-green-700 dark:text-green-300",
          daysLeftColor: "text-green-600 dark:text-green-400",
          statusColor: "text-green-600 dark:text-green-400",
          icon: <CheckCircle className="w-8 h-8" />,
        };
      case "already_marked":
        return {
          borderColor: "border-yellow-500",
          bgColor: "bg-yellow-50 dark:bg-slate-900",
          iconColor: "text-yellow-500",
          textColor: "text-yellow-700 dark:text-yellow-300",
          messageColor: "text-yellow-700 dark:text-yellow-300",
          daysLeftColor: "text-yellow-600 dark:text-yellow-400",
          statusColor: "text-yellow-600 dark:text-yellow-400",
          icon: <AlertTriangle className="w-8 h-8" />,
        };
      case "expired":
        return {
          borderColor: "border-red-500",
          bgColor: "bg-red-50 dark:bg-slate-900",
          iconColor: "text-red-500",
          textColor: "text-red-700 dark:text-red-300",
          messageColor: "text-red-700 dark:text-red-300",
          daysLeftColor: "text-red-600 dark:text-red-400",
          statusColor: "text-red-600 dark:text-red-400",
          icon: <AlertTriangle className="w-8 h-8" />,
        };
      case "error":
        return {
          borderColor: "border-red-500",
          bgColor: "bg-red-50 dark:bg-slate-900",
          iconColor: "text-red-500",
          textColor: "text-red-700 dark:text-red-300",
          messageColor: "text-red-700 dark:text-red-300",
          daysLeftColor: "text-red-600 dark:text-red-400",
          statusColor: "text-red-600 dark:text-red-400",
          icon: <AlertTriangle className="w-8 h-8" />,
        };
      default:
        return {
          borderColor: "border-gray-300",
          bgColor: "bg-gray-50 dark:bg-slate-900",
          iconColor: "text-gray-500 dark:text-gray-400",
          textColor: "text-gray-700 dark:text-gray-300",
          messageColor: "text-gray-700 dark:text-gray-300",
          daysLeftColor: "text-gray-600 dark:text-gray-400",
          statusColor: "text-gray-600 dark:text-gray-400",
          icon: null,
        };
    }
  };

  const previewStyle = previewData ? getPreviewStyles(previewData.type) : null;

  // Full-screen preview view
  if (previewData && previewStyle) {
    return (
      <div className="flex h-[calc(100dvh-5.5rem)] sm:h-[calc(100dvh-6.5rem)] flex-col items-center overflow-hidden">
        <Card className={`flex min-h-0 h-full w-full max-w-lg flex-col overflow-hidden border-4 ${previewStyle.borderColor} ${previewStyle.bgColor} p-5 sm:p-6 space-y-4`}>
          <div className="text-center space-y-3">
            <div className={`flex justify-center ${previewStyle.iconColor}`}>
              {previewStyle.icon}
            </div>
            <h1 className={`text-3xl sm:text-4xl font-bold ${previewStyle.messageColor}`}>{previewData.message}</h1>
          </div>

          {previewData.student && (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto text-base sm:text-lg">
              <div className={`border-t-2 pt-4`} style={{borderColor: "currentColor"}}>
                <p className="text-muted-foreground text-sm mb-2">Name</p>
                <p className={`font-bold text-2xl ${previewStyle.textColor}`}>{previewData.student.name}</p>
              </div>

              <div>
                <p className="text-muted-foreground text-sm mb-2">Date</p>
                <p className={`font-bold text-xl ${previewStyle.textColor}`}>
                  {formatDateLong(new Date())}
                </p>
              </div>

              {previewData.student?.expiryDate && (
                <div>
                  <p className="text-muted-foreground text-sm mb-2">Expiry Date</p>
                  <p className={`font-bold text-xl ${previewStyle.textColor}`}>
                    {formatDateLong(previewData.student.expiryDate)}
                  </p>
                </div>
              )}

              {previewData.timeIn && previewData.type === "success" && (
                <div>
                  <p className="text-muted-foreground text-sm mb-2">Time In</p>
                  <p className={`font-bold text-xl ${previewStyle.textColor}`}>{previewData.timeIn}</p>
                </div>
              )}

              {previewData.daysLeft !== undefined && (
                <div>
                  <p className="text-muted-foreground text-sm mb-2">Days Left</p>
                  <p className={`font-bold text-3xl ${previewStyle.daysLeftColor}`}>
                    {previewData.daysLeft} days
                  </p>
                </div>
              )}

              {previewData.daysLeft !== undefined && (
                <div className={`border-t-2 pt-4`} style={{borderColor: "currentColor"}}>
                  <p className="text-muted-foreground text-sm mb-2">Status</p>
                  <p className={`font-bold text-2xl ${previewStyle.statusColor}`}>
                    {previewData.isExpired ? "EXPIRED" : "ACTIVE"}
                  </p>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    );
  }

  // Number pad view
  return (
    <div
      className="flex h-[calc(100dvh-5.5rem)] sm:h-[calc(100dvh-6.5rem)] flex-col items-center overflow-hidden"
      onPointerDown={focusInput}
    >
      <Card className="flex h-full min-h-0 w-full max-w-md flex-col overflow-hidden bg-card/80 p-5 sm:p-7 backdrop-blur">
        <div className="mb-4 space-y-1 text-center shrink-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Attendance</h1>
          <p className="text-xs font-semibold text-muted-foreground sm:text-xl">Enter your member ID</p>
        </div>

        <div className="mb-4 space-y-2 shrink-0">
          <Input
            ref={inputRef}
            id="register-input"
            type="text"
            value={registerNumber}
            onChange={(e) => setRegisterNumber(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            pattern="[0-9]*"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSubmit();
              } else if (e.key === "+") {
                // On-screen numeric keypads (tablets/phones) show a "+" key but
                // no delete key — treat it as backspace so a mistyped digit can
                // be corrected without re-entering the whole member ID.
                e.preventDefault();
                setRegisterNumber((prev) => prev.slice(0, -1));
              } else if (e.key.length === 1 && !/^\d$/.test(e.key)) {
                e.preventDefault();
              }
            }}
            className="h-16 text-center text-4xl font-bold sm:h-20 sm:text-5xl md:text-5xl"
            data-testid="input-register-number"
            autoFocus
          />
        </div>

        <div className="mb-4 grid min-h-0 flex-1 grid-cols-3 gap-3 sm:gap-4">
          {numbers.slice(0, 9).map((num) => (
            <Button
              key={num}
              variant="outline"
              size="lg"
              className="min-h-0 h-full text-2xl font-semibold"
              onClick={() => handleNumberClick(num)}
              disabled={loading}
              data-testid={`button-number-${num}`}
            >
              {num}
            </Button>
          ))}
        </div>

        <div className="mb-4 shrink-0">
          <Button
            variant="outline"
            size="lg"
            className="h-12 sm:h-14 w-full text-2xl font-semibold"
            onClick={() => handleNumberClick("0")}
            disabled={loading}
            data-testid="button-number-0"
          >
            0
          </Button>
        </div>

        {!readOnly && (
          <Button
            className="h-12 sm:h-14 w-full shrink-0 text-lg font-semibold"
            onClick={handleSubmit}
            disabled={!registerNumber || loading}
            data-testid="button-submit-attendance"
          >
            <Check className="mr-2 h-5 w-5" />
            {loading ? "Recording..." : "Submit"}
          </Button>
        )}
      </Card>
    </div>
  );
}

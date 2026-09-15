import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Delete, Check, AlertTriangle, CheckCircle } from "lucide-react";
import type { Student } from "@shared/schema";

type PreviewState = null | "success" | "expired" | "already_marked" | "error";

interface PreviewData {
  type: PreviewState;
  message: string;
  student?: {
    name: string;
    registerNumber: string;
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

  const { data: students } = useQuery<Student[]>({
    queryKey: ["/api/students"],
  });

  const handleNumberClick = (num: string) => {
    setRegisterNumber((prev) => prev + num);
  };

  const handleClearLast = () => {
    setRegisterNumber((prev) => prev.slice(0, -1));
  };

  const handleClearAll = () => {
    setRegisterNumber("");
    setPreviewData(null);
  };

  const handleSubmit = async () => {
    if (!registerNumber.trim()) {
      toast({
        title: "Please enter a register number",
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
        headers: { "Content-Type": "application/json" },
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
      <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center bg-gradient-to-br from-background to-muted/20 p-4">
        <Card className={`w-full max-w-lg p-12 space-y-8 border-4 ${previewStyle.borderColor} ${previewStyle.bgColor}`}>
          <div className="text-center space-y-6">
            <div className={`flex justify-center ${previewStyle.iconColor}`}>
              {previewStyle.icon}
            </div>
            <h1 className={`text-4xl font-bold ${previewStyle.messageColor}`}>{previewData.message}</h1>
          </div>

          {previewData.student && (
            <div className={`space-y-6 text-lg`}>
              <div className={`border-t-2 pt-6`} style={{borderColor: "currentColor"}}>
                <p className="text-muted-foreground text-sm mb-2">Name</p>
                <p className={`font-bold text-2xl ${previewStyle.textColor}`}>{previewData.student.name}</p>
              </div>

              <div>
                <p className="text-muted-foreground text-sm mb-2">Date</p>
                <p className={`font-bold text-xl ${previewStyle.textColor}`}>
                  {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "2-digit" })}
                </p>
              </div>

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
                <div className={`border-t-2 pt-6`} style={{borderColor: "currentColor"}}>
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
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center bg-gradient-to-br from-background to-muted/20 p-4">
      <Card className="w-full max-w-md p-8 space-y-6 bg-card/80 backdrop-blur">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Attendance</h1>
          <p className="text-sm text-muted-foreground">Enter your register number</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="register-input">Register Number</Label>
          <Input
            id="register-input"
            type="text"
            placeholder="Enter register number..."
            value={registerNumber}
            onChange={(e) => setRegisterNumber(e.target.value.toUpperCase())}
            className="text-center text-2xl font-bold h-16"
            data-testid="input-register-number"
            autoFocus
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          {numbers.slice(0, 9).map((num) => (
            <Button
              key={num}
              variant="outline"
              size="lg"
              className="h-16 text-2xl font-semibold"
              onClick={() => handleNumberClick(num)}
              disabled={loading}
              data-testid={`button-number-${num}`}
            >
              {num}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4">
          <Button
            variant="outline"
            size="lg"
            className="h-16 text-2xl font-semibold"
            onClick={() => handleNumberClick("0")}
            disabled={loading}
            data-testid="button-number-0"
          >
            0
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Button
            variant="outline"
            size="lg"
            className="h-14"
            onClick={handleClearLast}
            disabled={loading}
            data-testid="button-clear-last"
          >
            <Delete className="mr-2 h-5 w-5" />
            Clear Last
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="h-14"
            onClick={handleClearAll}
            disabled={loading}
            data-testid="button-clear-all"
          >
            Clear All
          </Button>
        </div>

        <Button
          className="w-full h-14 text-lg font-semibold"
          onClick={handleSubmit}
          disabled={!registerNumber || loading}
          data-testid="button-submit-attendance"
        >
          <Check className="mr-2 h-5 w-5" />
          {loading ? "Recording..." : "Submit"}
        </Button>
      </Card>
    </div>
  );
}

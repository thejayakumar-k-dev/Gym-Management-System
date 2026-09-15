import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useGymSettings } from "@/hooks/use-gym-settings";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, X, Upload } from "lucide-react";

const ICON_STYLES = [
  { name: "Red", bg: "bg-red-500", icon: "🏋️", color: "#ef4444" },
  { name: "Orange", bg: "bg-orange-500", icon: "🔥", color: "#f97316" },
  { name: "Blue", bg: "bg-blue-500", icon: "⚡", color: "#3b82f6" },
  { name: "Green", bg: "bg-green-500", icon: "📈", color: "#22c55e" },
  { name: "Yellow", bg: "bg-yellow-500", icon: "⭐", color: "#eab308" },
  { name: "Purple", bg: "bg-purple-500", icon: "👑", color: "#a855f7" },
  { name: "Pink", bg: "bg-pink-500", icon: "💪", color: "#ec4899" },
  { name: "Cyan", bg: "bg-cyan-500", icon: "🎯", color: "#06b6d4" },
];

export default function GymSettings() {
  const { settings, updateSettings } = useGymSettings();
  const { toast } = useToast();
  const [gymName, setGymName] = useState(settings.name);
  const [selectedStyle, setSelectedStyle] = useState(0);
  const [gymImage, setGymImage] = useState(settings.logoImage || "");
  const [imageType, setImageType] = useState<"icon" | "custom">(settings.logoImage && settings.logoImage.startsWith("data:") ? "custom" : "icon");
  const [cropScale, setCropScale] = useState(1);
  const [primaryColor, setPrimaryColor] = useState(settings.accentColor);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file type", variant: "destructive" });
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "File too large (max 2MB)", variant: "destructive" });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setGymImage(base64);
      setImageType("custom");
      setCropScale(1);
      toast({ title: "Image uploaded successfully!" });
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setGymImage("");
    setImageType("icon");
    setCropScale(1);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    toast({ title: "Image removed" });
  };

  const handleSelectIcon = (index: number) => {
    setSelectedStyle(index);
    setGymImage("");
    setImageType("icon");
    setPrimaryColor(ICON_STYLES[index].color);
  };


  const handleSaveSettings = () => {
    updateSettings({
      name: gymName,
      icon: ICON_STYLES[selectedStyle].icon,
      accentColor: primaryColor,
      logoImage: gymImage,
      cropScale: cropScale,
    });
    toast({
      title: "Settings saved!",
      description: "Your gym branding has been updated. The page will reload to apply changes.",
    });
    setTimeout(() => window.location.reload(), 1000);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
      {/* Left Side - Form */}
      <div className="lg:col-span-2 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-2">Customize your gym branding and appearance</p>
        </div>

        {/* Branding Settings Card */}
        <Card>
          <CardHeader>
            <CardTitle>Branding Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Gym Name */}
            <div className="space-y-2">
              <Label htmlFor="gym-name">
                Gym Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="gym-name"
                value={gymName}
                onChange={(e) => setGymName(e.target.value)}
                placeholder="e.g., JK GYM"
                data-testid="input-gym-name"
              />
            </div>

            {/* Gym Logo/Image */}
            <div className="space-y-3">
              <Label>Gym Logo/Image</Label>
              
              {/* Image Upload Section */}
              <div className="space-y-3">
                {/* File Input */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-6 text-center cursor-pointer hover:border-slate-400 dark:hover:border-slate-500 transition-colors"
                  data-testid="dropzone-image-upload"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                    data-testid="input-image-upload"
                  />
                  <Upload className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                  <p className="text-sm font-medium text-foreground">Click to upload image</p>
                  <p className="text-xs text-muted-foreground">PNG, JPG (max 2MB)</p>
                </div>

                {/* Image Preview */}
                {gymImage && imageType === "custom" && (
                  <div className="space-y-3">
                    <div className="relative group">
                      <img
                        src={gymImage}
                        alt="Gym Logo Preview"
                        className="w-full h-40 object-cover rounded-lg border border-slate-200 dark:border-slate-700"
                        style={{ transform: `scale(${cropScale})` }}
                        data-testid="image-preview"
                      />
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={handleRemoveImage}
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        data-testid="button-remove-image"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>

                    {/* Crop/Scale Control */}
                    <div className="space-y-2">
                      <Label className="text-sm">Adjust Image Size</Label>
                      <input
                        type="range"
                        min="0.8"
                        max="2"
                        step="0.1"
                        value={cropScale}
                        onChange={(e) => setCropScale(parseFloat(e.target.value))}
                        className="w-full"
                        data-testid="slider-crop-scale"
                      />
                      <div className="text-xs text-muted-foreground text-center">
                        Zoom: {(cropScale * 100).toFixed(0)}%
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Or Choose Default Icon Style */}
              <div className="pt-4 space-y-3 border-t border-slate-200 dark:border-slate-700">
                <div className="text-sm font-medium text-foreground">Choose Default Icon Style</div>
                <div className="grid grid-cols-4 gap-2">
                  {ICON_STYLES.map((style, index) => (
                    <button
                      key={index}
                      onClick={() => handleSelectIcon(index)}
                      className={`p-4 rounded-lg text-white font-semibold text-lg transition-all border-2 ${
                        selectedStyle === index && !gymImage
                          ? "border-slate-900 dark:border-slate-100 ring-2 ring-slate-900 dark:ring-slate-100"
                          : "border-transparent hover:opacity-80"
                      } ${style.bg}`}
                      data-testid={`button-icon-style-${index}`}
                    >
                      {style.icon}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Primary Color */}
            <div className="space-y-3">
              <Label>Primary Color</Label>
              <div className="flex items-center gap-4">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-16 h-12 rounded-lg cursor-pointer border-2 border-slate-300 dark:border-slate-600"
                  data-testid="input-primary-color"
                />
                <div className="text-sm font-mono text-muted-foreground">
                  {primaryColor.toUpperCase()}
                </div>
              </div>
            </div>

            {/* Buttons Container */}
            <div className="flex gap-3">
              <Button
                onClick={handleSaveSettings}
                className="w-full h-12 text-white font-bold"
                style={{ backgroundColor: primaryColor }}
                data-testid="button-save-settings"
              >
                Save Settings
              </Button>
            </div>

            {/* Note */}
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 flex gap-2">
              <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-blue-700 dark:text-blue-300">
                After saving, the page will reload to apply your changes throughout the entire application.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Side - Preview */}
      <div className="space-y-6">
        <Card className="sticky top-6">
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Sidebar Preview */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase">Sidebar Preview:</div>
              <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-xl flex-shrink-0 overflow-hidden" style={{ backgroundColor: primaryColor }}>
                    {gymImage && imageType === "custom" ? (
                      <img
                        src={gymImage}
                        alt="Logo"
                        className="w-full h-full object-cover"
                        style={{ transform: `scale(${cropScale})` }}
                      />
                    ) : (
                      ICON_STYLES[selectedStyle].icon
                    )}
                  </div>
                  <div>
                    <div className="font-bold text-foreground text-sm">{settings.name || "GymDesk"}</div>
                    <div className="text-xs text-muted-foreground">Management System</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Button Preview */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase">Button Preview:</div>
              <Button
                className="w-full text-white font-semibold"
                style={{ backgroundColor: primaryColor }}
              >
                Sample Button
              </Button>
            </div>

            {/* Note */}
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                <strong>Note:</strong> After saving, the page will reload to apply your changes throughout the entire application.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

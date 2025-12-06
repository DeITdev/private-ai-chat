import { useState, useEffect } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/components/ui/accordion";
import { Checkbox } from "~/components/ui/checkbox";
import { Slider } from "~/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";

interface DatGUIControlProps {
  // Display
  background: boolean;
  onBackgroundChange: (value: boolean) => void;
  autoRotate: boolean;
  onAutoRotateChange: (value: boolean) => void;
  wireframe: boolean;
  onWireframeChange: (value: boolean) => void;
  skeleton: boolean;
  onSkeletonChange: (value: boolean) => void;
  grid: boolean;
  onGridChange: (value: boolean) => void;
  pointSize: number;
  onPointSizeChange: (value: number) => void;
  bgColor: string;
  onBgColorChange: (value: string) => void;

  // Lighting
  toneMapping: string;
  onToneMappingChange: (value: string) => void;
  exposure: number;
  onExposureChange: (value: number) => void;
  punctualLights: boolean;
  onPunctualLightsChange: (value: boolean) => void;
  ambientIntensity: number;
  onAmbientIntensityChange: (value: number) => void;
  ambientColor: string;
  onAmbientColorChange: (value: string) => void;
  directIntensity: number;
  onDirectIntensityChange: (value: number) => void;
  directColor: string;
  onDirectColorChange: (value: string) => void;

  // Animation
  playbackSpeed: number;
  onPlaybackSpeedChange: (value: number) => void;
  onPlayAllClips: () => void;
}

export const DatGUIControl = ({
  background,
  onBackgroundChange,
  autoRotate,
  onAutoRotateChange,
  wireframe,
  onWireframeChange,
  skeleton,
  onSkeletonChange,
  grid,
  onGridChange,
  pointSize,
  onPointSizeChange,
  bgColor,
  onBgColorChange,
  toneMapping,
  onToneMappingChange,
  exposure,
  onExposureChange,
  punctualLights,
  onPunctualLightsChange,
  ambientIntensity,
  onAmbientIntensityChange,
  ambientColor,
  onAmbientColorChange,
  directIntensity,
  onDirectIntensityChange,
  directColor,
  onDirectColorChange,
  playbackSpeed,
  onPlaybackSpeedChange,
  onPlayAllClips,
}: DatGUIControlProps) => {
  const [showControls, setShowControls] = useState(false);

  // Local input values for free typing
  const [pointSizeInput, setPointSizeInput] = useState(pointSize.toString());
  const [exposureInput, setExposureInput] = useState(exposure.toString());
  const [ambientIntensityInput, setAmbientIntensityInput] = useState(
    ambientIntensity.toString()
  );
  const [directIntensityInput, setDirectIntensityInput] = useState(
    directIntensity.toString()
  );
  const [playbackSpeedInput, setPlaybackSpeedInput] = useState(
    playbackSpeed.toString()
  );

  // Sync local input values when props change (from slider or external updates)
  useEffect(() => setPointSizeInput(pointSize.toString()), [pointSize]);
  useEffect(() => setExposureInput(exposure.toString()), [exposure]);
  useEffect(
    () => setAmbientIntensityInput(ambientIntensity.toString()),
    [ambientIntensity]
  );
  useEffect(
    () => setDirectIntensityInput(directIntensity.toString()),
    [directIntensity]
  );
  useEffect(
    () => setPlaybackSpeedInput(playbackSpeed.toString()),
    [playbackSpeed]
  );

  return (
    <>
      {showControls ? (
        <div className="absolute top-20 right-4 w-[200px] md:w-[280px] lg:w-[320px] max-h-[calc(100%-100px)] overflow-y-auto bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90 border rounded-lg shadow-lg z-[45]">
          <Accordion type="multiple" defaultValue={[]} className="w-full">
            {/* Display Controls */}
            <AccordionItem value="display">
              <AccordionTrigger className="px-4 py-3 text-sm font-semibold">
                Display
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="background" className="text-sm">
                    Background
                  </Label>
                  <Checkbox
                    id="background"
                    checked={background}
                    onCheckedChange={(checked) => onBackgroundChange(!!checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="autoRotate" className="text-sm">
                    Auto Rotate
                  </Label>
                  <Checkbox
                    id="autoRotate"
                    checked={autoRotate}
                    onCheckedChange={(checked) => onAutoRotateChange(!!checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="wireframe" className="text-sm">
                    Wireframe
                  </Label>
                  <Checkbox
                    id="wireframe"
                    checked={wireframe}
                    onCheckedChange={(checked) => onWireframeChange(!!checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="skeleton" className="text-sm">
                    Skeleton
                  </Label>
                  <Checkbox
                    id="skeleton"
                    checked={skeleton}
                    onCheckedChange={(checked) => onSkeletonChange(!!checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="grid" className="text-sm">
                    Grid
                  </Label>
                  <Checkbox
                    id="grid"
                    checked={grid}
                    onCheckedChange={(checked) => onGridChange(!!checked)}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="pointSize" className="text-sm">
                      Point Size
                    </Label>
                    <Input
                      id="pointSizeInput"
                      type="text"
                      inputMode="decimal"
                      value={pointSizeInput}
                      onChange={(e) => setPointSizeInput(e.target.value)}
                      onBlur={() => {
                        const value = parseFloat(
                          pointSizeInput.replace(",", ".")
                        );
                        if (!isNaN(value)) {
                          const clamped = Math.max(1, Math.min(16, value));
                          onPointSizeChange(clamped);
                        } else {
                          setPointSizeInput(pointSize.toString());
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.currentTarget.blur();
                        }
                      }}
                      className="w-20 h-8 text-xs"
                    />
                  </div>
                  <Slider
                    id="pointSize"
                    min={1}
                    max={16}
                    step={0.1}
                    value={[pointSize]}
                    onValueChange={([value]) => onPointSizeChange(value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bgColor" className="text-sm">
                    Background Color
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal"
                      >
                        <div
                          className="w-4 h-4 rounded border mr-2"
                          style={{ backgroundColor: bgColor }}
                        />
                        <span className="text-xs">{bgColor}</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64">
                      <div className="space-y-2">
                        <Label htmlFor="bgColorInput" className="text-sm">
                          Choose Color
                        </Label>
                        <Input
                          id="bgColorInput"
                          type="color"
                          value={bgColor}
                          onChange={(e) => onBgColorChange(e.target.value)}
                          className="h-10 cursor-pointer"
                        />
                        <Input
                          type="text"
                          value={bgColor}
                          onChange={(e) => onBgColorChange(e.target.value)}
                          className="font-mono text-xs"
                        />
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Lighting Controls */}
            <AccordionItem value="lighting">
              <AccordionTrigger className="px-4 py-3 text-sm font-semibold">
                Lighting
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="toneMapping" className="text-sm">
                    Tone Mapping
                  </Label>
                  <Select
                    value={toneMapping}
                    onValueChange={onToneMappingChange}
                  >
                    <SelectTrigger id="toneMapping">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Linear">Linear</SelectItem>
                      <SelectItem value="ACES Filmic">ACES Filmic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="exposure" className="text-sm">
                      Exposure
                    </Label>
                    <Input
                      id="exposureInput"
                      type="text"
                      inputMode="decimal"
                      value={exposureInput}
                      onChange={(e) => setExposureInput(e.target.value)}
                      onBlur={() => {
                        const value = parseFloat(
                          exposureInput.replace(",", ".")
                        );
                        if (!isNaN(value)) {
                          const clamped = Math.max(-10, Math.min(10, value));
                          onExposureChange(clamped);
                        } else {
                          setExposureInput(exposure.toString());
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.currentTarget.blur();
                        }
                      }}
                      className="w-20 h-8 text-xs"
                    />
                  </div>
                  <Slider
                    id="exposure"
                    min={-10}
                    max={10}
                    step={0.01}
                    value={[exposure]}
                    onValueChange={([value]) => onExposureChange(value)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="punctualLights" className="text-sm">
                    Punctual Lights
                  </Label>
                  <Checkbox
                    id="punctualLights"
                    checked={punctualLights}
                    onCheckedChange={(checked) =>
                      onPunctualLightsChange(!!checked)
                    }
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="ambientIntensity" className="text-sm">
                      Ambient Intensity
                    </Label>
                    <Input
                      id="ambientIntensityInput"
                      type="text"
                      inputMode="decimal"
                      value={ambientIntensityInput}
                      onChange={(e) => setAmbientIntensityInput(e.target.value)}
                      onBlur={() => {
                        const value = parseFloat(
                          ambientIntensityInput.replace(",", ".")
                        );
                        if (!isNaN(value)) {
                          const clamped = Math.max(0, Math.min(2, value));
                          onAmbientIntensityChange(clamped);
                        } else {
                          setAmbientIntensityInput(ambientIntensity.toString());
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.currentTarget.blur();
                        }
                      }}
                      className="w-20 h-8 text-xs"
                    />
                  </div>
                  <Slider
                    id="ambientIntensity"
                    min={0}
                    max={2}
                    step={0.01}
                    value={[ambientIntensity]}
                    onValueChange={([value]) => onAmbientIntensityChange(value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ambientColor" className="text-sm">
                    Ambient Color
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal"
                      >
                        <div
                          className="w-4 h-4 rounded border mr-2"
                          style={{ backgroundColor: ambientColor }}
                        />
                        <span className="text-xs">{ambientColor}</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64">
                      <div className="space-y-2">
                        <Label htmlFor="ambientColorInput" className="text-sm">
                          Choose Color
                        </Label>
                        <Input
                          id="ambientColorInput"
                          type="color"
                          value={ambientColor}
                          onChange={(e) => onAmbientColorChange(e.target.value)}
                          className="h-10 cursor-pointer"
                        />
                        <Input
                          type="text"
                          value={ambientColor}
                          onChange={(e) => onAmbientColorChange(e.target.value)}
                          className="font-mono text-xs"
                        />
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="directIntensity" className="text-sm">
                      Direct Intensity
                    </Label>
                    <Input
                      id="directIntensityInput"
                      type="text"
                      inputMode="decimal"
                      value={directIntensityInput}
                      onChange={(e) => setDirectIntensityInput(e.target.value)}
                      onBlur={() => {
                        const value = parseFloat(
                          directIntensityInput.replace(",", ".")
                        );
                        if (!isNaN(value)) {
                          const clamped = Math.max(0, Math.min(4, value));
                          onDirectIntensityChange(clamped);
                        } else {
                          setDirectIntensityInput(directIntensity.toString());
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.currentTarget.blur();
                        }
                      }}
                      className="w-20 h-8 text-xs"
                    />
                  </div>
                  <Slider
                    id="directIntensity"
                    min={0}
                    max={4}
                    step={0.01}
                    value={[directIntensity]}
                    onValueChange={([value]) => onDirectIntensityChange(value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="directColor" className="text-sm">
                    Direct Color
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal"
                      >
                        <div
                          className="w-4 h-4 rounded border mr-2"
                          style={{ backgroundColor: directColor }}
                        />
                        <span className="text-xs">{directColor}</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64">
                      <div className="space-y-2">
                        <Label htmlFor="directColorInput" className="text-sm">
                          Choose Color
                        </Label>
                        <Input
                          id="directColorInput"
                          type="color"
                          value={directColor}
                          onChange={(e) => onDirectColorChange(e.target.value)}
                          className="h-10 cursor-pointer"
                        />
                        <Input
                          type="text"
                          value={directColor}
                          onChange={(e) => onDirectColorChange(e.target.value)}
                          className="font-mono text-xs"
                        />
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Animation Controls */}
            <AccordionItem value="animation">
              <AccordionTrigger className="px-4 py-3 text-sm font-semibold">
                Animation
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="playbackSpeed" className="text-sm">
                      Playback Speed
                    </Label>
                    <Input
                      id="playbackSpeedInput"
                      type="text"
                      inputMode="decimal"
                      value={playbackSpeedInput}
                      onChange={(e) => setPlaybackSpeedInput(e.target.value)}
                      onBlur={() => {
                        const value = parseFloat(
                          playbackSpeedInput.replace(",", ".")
                        );
                        if (!isNaN(value)) {
                          const clamped = Math.max(0, Math.min(1, value));
                          onPlaybackSpeedChange(clamped);
                        } else {
                          setPlaybackSpeedInput(playbackSpeed.toString());
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.currentTarget.blur();
                        }
                      }}
                      className="w-20 h-8 text-xs"
                    />
                  </div>
                  <Slider
                    id="playbackSpeed"
                    min={0}
                    max={1}
                    step={0.01}
                    value={[playbackSpeed]}
                    onValueChange={([value]) => onPlaybackSpeedChange(value)}
                  />
                </div>

                <Button
                  onClick={onPlayAllClips}
                  variant="outline"
                  className="w-full"
                >
                  Play All
                </Button>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {/* Close Control Button */}
          <div className="p-4 border-t">
            <Button
              onClick={() => setShowControls(false)}
              variant="outline"
              className="w-full"
            >
              Close Control
            </Button>
          </div>
        </div>
      ) : (
        /* Open Control Button */
        <div className="absolute top-20 right-4 z-[45]">
          <Button
            onClick={() => setShowControls(true)}
            variant="default"
            size="sm"
          >
            Open Control
          </Button>
        </div>
      )}
    </>
  );
};

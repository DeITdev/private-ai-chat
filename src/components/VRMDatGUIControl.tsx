import { useState, useEffect, useRef } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/components/ui/accordion";
import { Slider } from "~/components/ui/slider";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { predefinedPoses } from "~/constants";
import { Trash2, Download, Upload } from "lucide-react";

interface PoseData {
  name?: string;
  code?: string;
  vrmVersion?: string;
  data?: Record<string, unknown>;
}

interface SpringBoneSettings {
  dragForce: number;
  gravityPower: number;
  hitRadius: number;
  stiffness: number;
  gravityDir: {
    x: number;
    y: number;
    z: number;
  };
}

interface SpringBone {
  name: string;
  settings: SpringBoneSettings;
}

interface Expression {
  name: string;
  value: number;
}

interface ShapeKey {
  name: string;
  value: number;
}

interface CustomPose {
  name: string;
  data: PoseData;
}

export interface VRMDatGUIControlRef {
  getExpressions: () => Expression[];
  getShapeKeys: () => ShapeKey[];
  getSpringBones: () => SpringBone[];
}

interface VRMDatGUIControlProps {
  onPoseLoad?: (poseData: PoseData) => void;
  onBoneManipulationModeChange?: (mode: "off" | "ik" | "fk") => void;
  onExpressionChange?: (name: string, value: number) => void;
  onShapeKeyChange?: (name: string, value: number) => void;
  onSpringBoneSettingChange?: (
    boneName: string,
    setting: keyof SpringBoneSettings,
    value: number
  ) => void;
  onSavePose?: (poseName: string, poseData: PoseData) => void;
  expressions?: Expression[];
  shapeKeys?: ShapeKey[];
  springBones?: SpringBone[];
}

export const VRMDatGUIControl = ({
  onPoseLoad,
  onBoneManipulationModeChange,
  onExpressionChange,
  onShapeKeyChange,
  onSpringBoneSettingChange,
  onSavePose,
  expressions = [],
  shapeKeys = [],
  springBones = [],
}: VRMDatGUIControlProps) => {
  const [showControls, setShowControls] = useState(false);
  const [customPoses, setCustomPoses] = useState<CustomPose[]>([]);
  const [boneMode, setBoneMode] = useState<"off" | "ik" | "fk">("off");
  const [newPoseName, setNewPoseName] = useState("");
  const [showAddPose, setShowAddPose] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Expression input states
  const [expressionInputs, setExpressionInputs] = useState<
    Record<string, string>
  >({});

  // ShapeKey input states
  const [shapeKeyInputs, setShapeKeyInputs] = useState<Record<string, string>>(
    {}
  );

  // Spring bone input states
  const [springBoneInputs, setSpringBoneInputs] = useState<
    Record<string, Record<string, string>>
  >({});

  // Initialize input states when data changes
  useEffect(() => {
    const newInputs: Record<string, string> = {};
    expressions.forEach((exp) => {
      newInputs[exp.name] = exp.value.toString();
    });
    setExpressionInputs(newInputs);
  }, [expressions]);

  useEffect(() => {
    const newInputs: Record<string, string> = {};
    shapeKeys.forEach((key) => {
      newInputs[key.name] = key.value.toString();
    });
    setShapeKeyInputs(newInputs);
  }, [shapeKeys]);

  useEffect(() => {
    const newInputs: Record<string, Record<string, string>> = {};
    springBones.forEach((bone) => {
      newInputs[bone.name] = {
        dragForce: bone.settings.dragForce.toString(),
        gravityPower: bone.settings.gravityPower.toString(),
        hitRadius: bone.settings.hitRadius.toString(),
        stiffness: bone.settings.stiffness.toString(),
        gravityDirX: bone.settings.gravityDir.x.toString(),
        gravityDirY: bone.settings.gravityDir.y.toString(),
        gravityDirZ: bone.settings.gravityDir.z.toString(),
      };
    });
    setSpringBoneInputs(newInputs);
  }, [springBones]);

  const handlePoseClick = async (posePath: string) => {
    try {
      const response = await fetch(posePath);
      const poseData = await response.json();
      onPoseLoad?.(poseData);
    } catch (error) {
      console.error("Failed to load pose:", error);
    }
  };

  const handleCustomPoseClick = (poseData: PoseData) => {
    onPoseLoad?.(poseData);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.name.endsWith(".json")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const poseData = JSON.parse(e.target?.result as string);
          const poseName = file.name.replace(".json", "");
          setCustomPoses([...customPoses, { name: poseName, data: poseData }]);
          onPoseLoad?.(poseData);
        } catch (error) {
          console.error("Failed to parse pose file:", error);
        }
      };
      reader.readAsText(file);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSaveCurrentPose = () => {
    if (newPoseName.trim()) {
      // This would need to get current bone positions from VRM
      // For now, we'll just signal the parent to save
      onSavePose?.(newPoseName, {});
      setNewPoseName("");
      setShowAddPose(false);
    }
  };

  const handleDeleteCustomPose = (index: number) => {
    setCustomPoses(customPoses.filter((_, i) => i !== index));
  };

  const handleDownloadPose = (pose: CustomPose) => {
    const dataStr = JSON.stringify(pose.data, null, 2);
    const dataUri =
      "data:application/json;charset=utf-8," + encodeURIComponent(dataStr);
    const exportFileDefaultName = `${pose.name}.json`;

    const linkElement = document.createElement("a");
    linkElement.setAttribute("href", dataUri);
    linkElement.setAttribute("download", exportFileDefaultName);
    linkElement.click();
  };

  const handleBoneModeChange = (mode: string) => {
    const newMode = mode as "off" | "ik" | "fk";
    setBoneMode(newMode);
    onBoneManipulationModeChange?.(newMode);
  };

  const handleExpressionInputChange = (name: string, value: string) => {
    setExpressionInputs({ ...expressionInputs, [name]: value });
  };

  const handleExpressionInputBlur = (name: string, currentValue: number) => {
    const value = parseFloat(expressionInputs[name]?.replace(",", ".") || "0");
    if (!isNaN(value)) {
      const clamped = Math.max(0, Math.min(1, value));
      onExpressionChange?.(name, clamped);
    } else {
      setExpressionInputs({
        ...expressionInputs,
        [name]: currentValue.toString(),
      });
    }
  };

  const handleShapeKeyInputChange = (name: string, value: string) => {
    setShapeKeyInputs({ ...shapeKeyInputs, [name]: value });
  };

  const handleShapeKeyInputBlur = (name: string, currentValue: number) => {
    const value = parseFloat(shapeKeyInputs[name]?.replace(",", ".") || "0");
    if (!isNaN(value)) {
      const clamped = Math.max(0, Math.min(1, value));
      onShapeKeyChange?.(name, clamped);
    } else {
      setShapeKeyInputs({ ...shapeKeyInputs, [name]: currentValue.toString() });
    }
  };

  return (
    <>
      {showControls ? (
        <div className="absolute top-20 right-4 w-[200px] md:w-[280px] lg:w-[320px] max-h-[calc(100%-100px)] overflow-y-auto bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90 border rounded-lg shadow-lg z-[45]">
          <Accordion type="multiple" defaultValue={[]} className="w-full">
            {/* Posing Controls */}
            <AccordionItem value="posing">
              <AccordionTrigger className="px-4 py-3 text-sm font-semibold">
                Posing
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-4">
                {/* Upload/Drop Zone */}
                <div className="border-2 border-dashed rounded-lg p-4 text-center">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground mb-2">
                    Upload or drop json file here
                  </p>
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    variant="outline"
                    size="sm"
                  >
                    Choose File
                  </Button>
                </div>

                {/* Available Poses */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">
                    Available poses
                  </Label>

                  {/* Predefined Poses */}
                  {predefinedPoses.map((pose) => (
                    <div
                      key={pose.path}
                      className="flex items-center justify-between p-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 cursor-pointer"
                      onClick={() => handlePoseClick(pose.path)}
                    >
                      <span className="text-sm">{pose.name}</span>
                      <Download className="h-4 w-4" />
                    </div>
                  ))}

                  {/* Custom Poses */}
                  {customPoses.map((pose, index) => (
                    <div
                      key={`custom-${index}`}
                      className="flex items-center justify-between p-2 bg-secondary rounded"
                    >
                      <span
                        className="text-sm flex-1 cursor-pointer"
                        onClick={() => handleCustomPoseClick(pose.data)}
                      >
                        {pose.name}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownloadPose(pose)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteCustomPose(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add Pose */}
                {!showAddPose ? (
                  <Button
                    onClick={() => setShowAddPose(true)}
                    variant="outline"
                    className="w-full"
                  >
                    + Add Custom Pose
                  </Button>
                ) : (
                  <div className="space-y-2 p-3 border rounded-lg">
                    <Input
                      placeholder="Pose name"
                      value={newPoseName}
                      onChange={(e) => setNewPoseName(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={handleSaveCurrentPose}
                        size="sm"
                        disabled={!newPoseName.trim()}
                        className="flex-1"
                      >
                        ADD
                      </Button>
                      <Button
                        onClick={() => {
                          setShowAddPose(false);
                          setNewPoseName("");
                        }}
                        variant="outline"
                        size="sm"
                        className="flex-1"
                      >
                        DISCARD
                      </Button>
                    </div>

                    {/* Bone Manipulation Mode */}
                    <Tabs
                      value={boneMode}
                      onValueChange={handleBoneModeChange}
                      className="w-full"
                    >
                      <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="off">OFF</TabsTrigger>
                        <TabsTrigger value="ik">IK</TabsTrigger>
                        <TabsTrigger value="fk">FK</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* Spring Bones Controls */}
            <AccordionItem value="springBones">
              <AccordionTrigger className="px-4 py-3 text-sm font-semibold">
                Spring bones
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <Accordion type="single" collapsible className="w-full">
                  {springBones.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No spring bones available
                    </p>
                  ) : (
                    springBones.map((bone) => (
                      <AccordionItem key={bone.name} value={bone.name}>
                        <AccordionTrigger className="text-sm py-2">
                          {bone.name}
                        </AccordionTrigger>
                        <AccordionContent className="space-y-3 pb-2">
                          {/* Drag Force */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs">DragForce</Label>
                              <Input
                                type="text"
                                inputMode="decimal"
                                value={
                                  springBoneInputs[bone.name]?.dragForce || "0"
                                }
                                onChange={(e) => {
                                  const newInputs = { ...springBoneInputs };
                                  if (!newInputs[bone.name])
                                    newInputs[bone.name] = {
                                      dragForce: "",
                                      gravityPower: "",
                                      hitRadius: "",
                                      stiffness: "",
                                      gravityDirX: "",
                                      gravityDirY: "",
                                      gravityDirZ: "",
                                    };
                                  newInputs[bone.name].dragForce =
                                    e.target.value;
                                  setSpringBoneInputs(newInputs);
                                }}
                                onBlur={() => {
                                  const value = parseFloat(
                                    springBoneInputs[
                                      bone.name
                                    ]?.dragForce?.replace(",", ".") || "0"
                                  );
                                  if (!isNaN(value)) {
                                    onSpringBoneSettingChange?.(
                                      bone.name,
                                      "dragForce",
                                      value
                                    );
                                  }
                                }}
                                className="w-16 h-7 text-xs"
                              />
                            </div>
                          </div>

                          {/* Gravity Power */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs">GravityPower</Label>
                              <Input
                                type="text"
                                inputMode="decimal"
                                value={
                                  springBoneInputs[bone.name]?.gravityPower ||
                                  "0"
                                }
                                onChange={(e) => {
                                  const newInputs = { ...springBoneInputs };
                                  if (!newInputs[bone.name])
                                    newInputs[bone.name] = {
                                      dragForce: "",
                                      gravityPower: "",
                                      hitRadius: "",
                                      stiffness: "",
                                      gravityDirX: "",
                                      gravityDirY: "",
                                      gravityDirZ: "",
                                    };
                                  newInputs[bone.name].gravityPower =
                                    e.target.value;
                                  setSpringBoneInputs(newInputs);
                                }}
                                onBlur={() => {
                                  const value = parseFloat(
                                    springBoneInputs[
                                      bone.name
                                    ]?.gravityPower?.replace(",", ".") || "0"
                                  );
                                  if (!isNaN(value)) {
                                    onSpringBoneSettingChange?.(
                                      bone.name,
                                      "gravityPower",
                                      value
                                    );
                                  }
                                }}
                                className="w-16 h-7 text-xs"
                              />
                            </div>
                          </div>

                          {/* Hit Radius */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs">Hit Radius</Label>
                              <Input
                                type="text"
                                inputMode="decimal"
                                value={
                                  springBoneInputs[bone.name]?.hitRadius || "0"
                                }
                                onChange={(e) => {
                                  const newInputs = { ...springBoneInputs };
                                  if (!newInputs[bone.name])
                                    newInputs[bone.name] = {
                                      dragForce: "",
                                      gravityPower: "",
                                      hitRadius: "",
                                      stiffness: "",
                                      gravityDirX: "",
                                      gravityDirY: "",
                                      gravityDirZ: "",
                                    };
                                  newInputs[bone.name].hitRadius =
                                    e.target.value;
                                  setSpringBoneInputs(newInputs);
                                }}
                                onBlur={() => {
                                  const value = parseFloat(
                                    springBoneInputs[
                                      bone.name
                                    ]?.hitRadius?.replace(",", ".") || "0"
                                  );
                                  if (!isNaN(value)) {
                                    onSpringBoneSettingChange?.(
                                      bone.name,
                                      "hitRadius",
                                      value
                                    );
                                  }
                                }}
                                className="w-16 h-7 text-xs"
                              />
                            </div>
                          </div>

                          {/* Stiffness */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs">Stiffness</Label>
                              <Input
                                type="text"
                                inputMode="decimal"
                                value={
                                  springBoneInputs[bone.name]?.stiffness || "0"
                                }
                                onChange={(e) => {
                                  const newInputs = { ...springBoneInputs };
                                  if (!newInputs[bone.name])
                                    newInputs[bone.name] = {
                                      dragForce: "",
                                      gravityPower: "",
                                      hitRadius: "",
                                      stiffness: "",
                                      gravityDirX: "",
                                      gravityDirY: "",
                                      gravityDirZ: "",
                                    };
                                  newInputs[bone.name].stiffness =
                                    e.target.value;
                                  setSpringBoneInputs(newInputs);
                                }}
                                onBlur={() => {
                                  const value = parseFloat(
                                    springBoneInputs[
                                      bone.name
                                    ]?.stiffness?.replace(",", ".") || "0"
                                  );
                                  if (!isNaN(value)) {
                                    onSpringBoneSettingChange?.(
                                      bone.name,
                                      "stiffness",
                                      value
                                    );
                                  }
                                }}
                                className="w-16 h-7 text-xs"
                              />
                            </div>
                          </div>

                          {/* Gravity Dir */}
                          <div className="space-y-2">
                            <Label className="text-xs font-semibold">
                              Gravity Dir
                            </Label>
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <Label className="text-xs text-muted-foreground">
                                  X
                                </Label>
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  value={
                                    springBoneInputs[bone.name]?.gravityDirX ||
                                    "0"
                                  }
                                  onChange={(e) => {
                                    const newInputs = { ...springBoneInputs };
                                    if (!newInputs[bone.name])
                                      newInputs[bone.name] = {
                                        dragForce: "",
                                        gravityPower: "",
                                        hitRadius: "",
                                        stiffness: "",
                                        gravityDirX: "",
                                        gravityDirY: "",
                                        gravityDirZ: "",
                                      };
                                    newInputs[bone.name].gravityDirX =
                                      e.target.value;
                                    setSpringBoneInputs(newInputs);
                                  }}
                                  className="w-full h-7 text-xs"
                                />
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground">
                                  Y
                                </Label>
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  value={
                                    springBoneInputs[bone.name]?.gravityDirY ||
                                    "0"
                                  }
                                  onChange={(e) => {
                                    const newInputs = { ...springBoneInputs };
                                    if (!newInputs[bone.name])
                                      newInputs[bone.name] = {
                                        dragForce: "",
                                        gravityPower: "",
                                        hitRadius: "",
                                        stiffness: "",
                                        gravityDirX: "",
                                        gravityDirY: "",
                                        gravityDirZ: "",
                                      };
                                    newInputs[bone.name].gravityDirY =
                                      e.target.value;
                                    setSpringBoneInputs(newInputs);
                                  }}
                                  className="w-full h-7 text-xs"
                                />
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground">
                                  Z
                                </Label>
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  value={
                                    springBoneInputs[bone.name]?.gravityDirZ ||
                                    "0"
                                  }
                                  onChange={(e) => {
                                    const newInputs = { ...springBoneInputs };
                                    if (!newInputs[bone.name])
                                      newInputs[bone.name] = {
                                        dragForce: "",
                                        gravityPower: "",
                                        hitRadius: "",
                                        stiffness: "",
                                        gravityDirX: "",
                                        gravityDirY: "",
                                        gravityDirZ: "",
                                      };
                                    newInputs[bone.name].gravityDirZ =
                                      e.target.value;
                                    setSpringBoneInputs(newInputs);
                                  }}
                                  className="w-full h-7 text-xs"
                                />
                              </div>
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))
                  )}
                </Accordion>
              </AccordionContent>
            </AccordionItem>

            {/* Expressions Controls */}
            <AccordionItem value="expressions">
              <AccordionTrigger className="px-4 py-3 text-sm font-semibold">
                Expressions
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-3">
                {expressions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No expressions available
                  </p>
                ) : (
                  expressions.map((expression) => (
                    <div key={expression.name} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">{expression.name}</Label>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={expressionInputs[expression.name] || "0"}
                          onChange={(e) =>
                            handleExpressionInputChange(
                              expression.name,
                              e.target.value
                            )
                          }
                          onBlur={() =>
                            handleExpressionInputBlur(
                              expression.name,
                              expression.value
                            )
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.currentTarget.blur();
                            }
                          }}
                          className="w-16 h-7 text-xs"
                        />
                      </div>
                      <Slider
                        min={0}
                        max={1}
                        step={0.01}
                        value={[expression.value]}
                        onValueChange={([value]) =>
                          onExpressionChange?.(expression.name, value)
                        }
                      />
                    </div>
                  ))
                )}
              </AccordionContent>
            </AccordionItem>

            {/* ShapeKeys Controls */}
            <AccordionItem value="shapekeys">
              <AccordionTrigger className="px-4 py-3 text-sm font-semibold">
                Shapekeys
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-3">
                {shapeKeys.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No shapekeys available
                  </p>
                ) : (
                  shapeKeys.map((shapeKey) => (
                    <div key={shapeKey.name} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">{shapeKey.name}</Label>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={shapeKeyInputs[shapeKey.name] || "0"}
                          onChange={(e) =>
                            handleShapeKeyInputChange(
                              shapeKey.name,
                              e.target.value
                            )
                          }
                          onBlur={() =>
                            handleShapeKeyInputBlur(
                              shapeKey.name,
                              shapeKey.value
                            )
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.currentTarget.blur();
                            }
                          }}
                          className="w-16 h-7 text-xs"
                        />
                      </div>
                      <Slider
                        min={0}
                        max={1}
                        step={0.01}
                        value={[shapeKey.value]}
                        onValueChange={([value]) =>
                          onShapeKeyChange?.(shapeKey.name, value)
                        }
                      />
                    </div>
                  ))
                )}
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

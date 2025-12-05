import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "~/components/ui/dialog";

interface SelectionItem {
  name: string;
  path: string;
  thumbnail: string;
}

interface SelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  items: SelectionItem[];
  selectedItem: string;
  onSelectItem: (path: string) => void;
  descriptionId: string;
}

export const SelectionModal = ({
  open,
  onOpenChange,
  title,
  description,
  items,
  selectedItem,
  onSelectItem,
  descriptionId,
}: SelectionModalProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[600px]"
        aria-describedby={descriptionId}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription id={descriptionId}>
            {description}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-3 gap-4 p-4">
            {items.map((item) => (
              <button
                key={item.path}
                onClick={() => onSelectItem(item.path)}
                className="group relative flex flex-col items-center gap-2 transition-transform hover:-translate-y-2"
              >
                <div
                  className={`w-full aspect-square rounded-2xl overflow-hidden border-2 transition-colors ${
                    selectedItem === item.path
                      ? "border-primary"
                      : "border-transparent group-hover:border-primary/50"
                  }`}
                >
                  <img
                    src={item.thumbnail}
                    alt={item.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <span className="text-sm font-medium text-center">
                  {item.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

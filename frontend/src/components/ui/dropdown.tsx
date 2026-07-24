import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";

interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  label: string;
  options: DropdownOption[];
  value: string | string[];
  onChange: (value: string | string[]) => void;
  multiple?: boolean;
  placeholder?: string;
}

export function Dropdown({
  label,
  options,
  value,
  onChange,
  multiple = false,
  // placeholder = "Select...",
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedValues = Array.isArray(value) ? value : value ? [value] : [];



  const handleSelect = (optionValue: string) => {
    if (multiple) {
      const newValue = selectedValues.includes(optionValue)
        ? selectedValues.filter((v) => v !== optionValue)
        : [...selectedValues, optionValue];
      onChange(newValue);
    } else {
      onChange(optionValue);
      setIsOpen(false);
    }
  };

  const hasSelection = multiple ? selectedValues.length > 0 : !!value;

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border transition-colors ${
          hasSelection
            ? "bg-primary/10 text-primary border-primary/30"
            : "bg-secondary text-muted-foreground border-transparent hover:bg-secondary/80"
        }`}
      >
        {label}
        {hasSelection && (
          <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
            {selectedValues.length}
          </span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-48 bg-card border border-border rounded-lg shadow-lg z-50 py-1 animate-fade-in">
          {options.map((option) => {
            const isSelected = selectedValues.includes(option.value);
            return (
              <button
                key={option.value}
                onClick={() => handleSelect(option.value)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-secondary transition-colors"
              >
                {multiple && (
                  <div
                    className={`w-4 h-4 rounded border flex items-center justify-center ${
                      isSelected
                        ? "bg-primary border-primary"
                        : "border-border"
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                  </div>
                )}
                <span className={isSelected && !multiple ? "text-primary font-medium" : "text-foreground"}>
                  {option.label}
                </span>
              </button>
            );
          })}
          {multiple && selectedValues.length > 0 && (
            <div className="border-t border-border mt-1 pt-1">
              <button
                onClick={() => onChange([])}
                className="w-full px-3 py-2 text-sm text-left text-muted-foreground hover:text-red-400 transition-colors"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ActionMenuProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
}

export function ActionMenu({ trigger, children }: ActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={menuRef} className="relative">
      <div onClick={() => setIsOpen(!isOpen)}>{trigger}</div>
      {isOpen && (
        <div
          className="absolute right-0 top-full mt-1 w-48 bg-card border border-border rounded-lg shadow-lg z-50 py-1 animate-fade-in"
          onClick={() => setIsOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

interface ActionMenuItemProps {
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
}

export function ActionMenuItem({ icon, children, onClick, danger }: ActionMenuItemProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
        danger
          ? "text-red-400 hover:bg-red-500/10"
          : "text-foreground hover:bg-secondary"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

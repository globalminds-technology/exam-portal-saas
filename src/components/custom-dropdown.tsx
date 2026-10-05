'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface DropdownOption {
  value: string;
  label: string;
  count?: number | string;
  badge?: string;
  icon?: React.ReactNode;
}

interface CustomDropdownProps {
  label: string;
  icon?: React.ReactNode;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  menuWidth?: string;
  colorScheme?: 'blue' | 'purple' | 'emerald' | 'slate';
}

export default function CustomDropdown({
  label,
  icon,
  value,
  options,
  onChange,
  placeholder = 'Select',
  className = '',
  menuWidth = 'min-w-[200px] max-w-[280px]',
  colorScheme = 'blue',
}: CustomDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape key
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const selectedOption = options.find((opt) => opt.value === value);
  const displayLabel = selectedOption ? selectedOption.label : placeholder;

  const colorStyles = {
    blue: {
      ring: 'ring-2 ring-blue-500/20 border-blue-500 bg-white',
      activeBg: 'bg-blue-50 text-blue-700 font-bold',
      checkColor: 'text-blue-600',
      hoverBg: 'hover:bg-blue-50/60 hover:text-blue-700',
      chevronOpen: 'text-blue-600',
    },
    purple: {
      ring: 'ring-2 ring-purple-500/20 border-purple-500 bg-white',
      activeBg: 'bg-purple-50 text-purple-700 font-bold',
      checkColor: 'text-purple-600',
      hoverBg: 'hover:bg-purple-50/60 hover:text-purple-700',
      chevronOpen: 'text-purple-600',
    },
    emerald: {
      ring: 'ring-2 ring-emerald-500/20 border-emerald-500 bg-white',
      activeBg: 'bg-emerald-50 text-emerald-700 font-bold',
      checkColor: 'text-emerald-600',
      hoverBg: 'hover:bg-emerald-50/60 hover:text-emerald-700',
      chevronOpen: 'text-emerald-600',
    },
    slate: {
      ring: 'ring-2 ring-slate-500/20 border-slate-500 bg-white',
      activeBg: 'bg-slate-100 text-slate-900 font-bold',
      checkColor: 'text-slate-800',
      hoverBg: 'hover:bg-slate-50 hover:text-slate-900',
      chevronOpen: 'text-slate-700',
    },
  }[colorScheme];

  return (
    <div className={`relative inline-block text-left shrink-0 ${className}`} ref={containerRef}>
      {/* Trigger Button Pill */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all select-none cursor-pointer ${
          isOpen
            ? colorStyles.ring
            : 'bg-white hover:bg-slate-50/90 border-slate-200/90 text-slate-800 shadow-xs'
        }`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        {icon && <span className="shrink-0">{icon}</span>}
        <span className="font-bold text-slate-500 shrink-0">{label}:</span>
        <span className="font-semibold text-slate-800 max-w-[100px] sm:max-w-[130px] truncate text-left">
          {displayLabel}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 ml-0.5 shrink-0 transition-transform duration-200 ${
            isOpen ? `rotate-180 ${colorStyles.chevronOpen}` : 'text-slate-400'
          }`}
        />
      </button>

      {/* Popover Floating Menu */}
      {isOpen && (
        <div
          className={`absolute left-0 top-full mt-2 z-50 ${menuWidth} bg-white rounded-2xl border border-slate-200 shadow-2xl shadow-slate-900/10 p-1.5 animate-in fade-in-0 zoom-in-95 duration-100 origin-top-left`}
          role="listbox"
          style={{ willChange: 'transform, opacity' }}
        >
          {/* Menu Header */}
          <div className="px-2.5 py-1.5 border-b border-slate-100 mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
            <span>Filter by {label}</span>
            <span className="text-slate-400 font-semibold">{options.length}</span>
          </div>

          {/* Options List with ultra-clean subtle scrollbar */}
          <div className="max-h-60 overflow-y-auto space-y-0.5 pr-0.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-left transition-colors cursor-pointer ${
                    isSelected
                      ? colorStyles.activeBg
                      : `text-slate-700 ${colorStyles.hoverBg}`
                  }`}
                  role="option"
                  aria-selected={isSelected}
                >
                  <div className="flex items-center gap-2 min-w-0 mr-2">
                    {option.icon && <span className="shrink-0">{option.icon}</span>}
                    <span className="truncate">{option.label}</span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {option.count !== undefined && (
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                          isSelected
                            ? 'bg-white/80 shadow-xs'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {option.count}
                      </span>
                    )}
                    {isSelected && (
                      <Check className={`w-3.5 h-3.5 shrink-0 ${colorStyles.checkColor}`} />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

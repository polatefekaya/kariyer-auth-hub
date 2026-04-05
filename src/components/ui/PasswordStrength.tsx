import { type Component, createMemo } from 'solid-js';
import { zxcvbn } from '@zxcvbn-ts/core';
import { cn } from '../../utils/cn';

export interface PasswordRules {
  hasLength: boolean;
  hasUpper: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
  hasScore: boolean;
  isAllValid: boolean;
}

interface PasswordStrengthProps {
  password: string;
  rules: PasswordRules;
}

export const PasswordStrength: Component<PasswordStrengthProps> = (props) => {
  const score = createMemo(() => {
    if (!props.password) return 0;
    return zxcvbn(props.password).score;
  });

  const getLabel = (s: number) => {
    switch (s) {
      case 0: return 'Çok Güçsüz';
      case 1: return 'Güçsüz';
      case 2: return 'Normal';
      case 3: return 'İyi';
      case 4: return 'Harika';
      default: return '';
    }
  };

  const getColor = (s: number) => {
    switch (s) {
      case 1: return 'bg-red-500';
      case 2: return 'bg-orange-500';
      case 3: return 'bg-sky-600';
      case 4: return 'bg-emerald-500';
      default: return 'bg-slate-200';
    }
  };

  const RuleItem: Component<{ met: boolean; text: string }> = (rProps) => (
    <div class="flex items-center gap-2">
      <svg class={cn("w-3.5 h-3.5 transition-colors duration-200", rProps.met ? "text-emerald-500" : "text-slate-300")} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <span class={cn("text-xs font-medium transition-colors duration-200", rProps.met ? "text-slate-700" : "text-slate-400")}>
        {rProps.text}
      </span>
    </div>
  );

  return (
    <div class="flex flex-col gap-2 mt-2 px-1">
      <div class="flex justify-between items-end">
        <span class="text-xs  text-slate-500">Düzey</span>
        <span class={cn(
          "text-xs font-medium tracking-wider transition-colors duration-200",
          score() === 0 ? "text-slate-400" : score() < 3 ? "text-orange-600" : "text-emerald-600"
        )}>
          {getLabel(score())}
        </span>
      </div>

      <div class="flex gap-1.5 h-1.5 w-full">
        {[1, 2, 3, 4].map((level) => (
          <div class={cn("h-full flex-1 rounded-sm transition-colors duration-200", score() >= level ? getColor(score()) : "bg-slate-200")} />
        ))}
      </div>

      <div class="grid grid-cols-2 gap-y-1.5 mt-1">
        <RuleItem met={props.rules.hasLength} text="8+ karakter" />
        <RuleItem met={props.rules.hasUpper} text="1 büyük harf" />
        <RuleItem met={props.rules.hasNumber} text="1 sayı" />
        <RuleItem met={props.rules.hasSpecial} text="1 özel karakter" />
        <RuleItem met={props.rules.hasScore} text="Düzey İyi ve üzeri olmalı" />
      </div>
    </div>
  );
};
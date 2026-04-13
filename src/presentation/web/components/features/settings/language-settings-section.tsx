'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { Globe, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { updateSettingsAction } from '@/app/actions/update-settings';
import { Language } from '@shepai/core/domain/generated/output';

const LANGUAGE_OPTIONS = [
  { value: Language.English, label: 'English', nativeName: 'English' },
  { value: Language.Ukrainian, label: 'Українська', nativeName: 'Українська' },
  { value: Language.Russian, label: 'Русский', nativeName: 'Русский' },
  { value: Language.Portuguese, label: 'Português', nativeName: 'Português' },
  { value: Language.Spanish, label: 'Español', nativeName: 'Español' },
  { value: Language.Arabic, label: 'العربية', nativeName: 'العربية' },
  { value: Language.Hebrew, label: 'עברית', nativeName: 'עברית' },
  { value: Language.French, label: 'Français', nativeName: 'Français' },
  { value: Language.German, label: 'Deutsch', nativeName: 'Deutsch' },
];

export interface LanguageSettingsSectionProps {
  language: string;
}

export function LanguageSettingsSection({
  language: initialLanguage,
}: LanguageSettingsSectionProps) {
  const { t, i18n } = useTranslation('web');
  const [language, setLanguage] = useState(initialLanguage);
  const [isPending, startTransition] = useTransition();
  const [showSaved, setShowSaved] = useState(false);
  const prevPendingRef = useRef(false);

  useEffect(() => {
    if (prevPendingRef.current && !isPending) {
      setShowSaved(true);
      const timer = setTimeout(() => setShowSaved(false), 2000);
      return () => clearTimeout(timer);
    }
    prevPendingRef.current = isPending;
  }, [isPending]);

  function handleLanguageChange(value: string) {
    setLanguage(value);
    // Update i18n language immediately for instant UI feedback
    i18n.changeLanguage(value);
    // Update document direction for RTL languages
    const dir = value === 'ar' || value === 'he' ? 'rtl' : 'ltr';
    document.documentElement.lang = value;
    document.documentElement.dir = dir;

    startTransition(async () => {
      const result = await updateSettingsAction({
        user: { preferredLanguage: value as Language },
      });
      if (!result.success) {
        toast.error(
          result.error ?? t('settings.language.failedToSave', 'Failed to save language settings')
        );
      }
    });
  }

  return (
    <Card id="language" className="scroll-mt-6" data-testid="language-settings-section">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="text-muted-foreground h-4 w-4" />
            <CardTitle>{t('settings.language.title')}</CardTitle>
          </div>
          {isPending ? (
            <span className="text-muted-foreground text-xs">{t('common:labels.saving')}</span>
          ) : null}
          {showSaved && !isPending ? (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <Check className="h-3 w-3" />
              {t('common:labels.saved')}
            </span>
          ) : null}
        </div>
        <CardDescription>{t('settings.language.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="display-language">{t('settings.language.label')}</Label>
          <Select value={language} onValueChange={handleLanguageChange}>
            <SelectTrigger id="display-language" data-testid="language-select">
              <SelectValue placeholder={t('settings.language.placeholder')} />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.nativeName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

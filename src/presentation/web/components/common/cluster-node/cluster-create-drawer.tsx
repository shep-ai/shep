'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BaseDrawer } from '@/components/common/base-drawer/base-drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

export interface ClusterCreateDrawerProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: { name: string; description?: string; argoCdEnabled: boolean }) => void;
  loading?: boolean;
}

export function ClusterCreateDrawer({
  open,
  onClose,
  onSubmit,
  loading,
}: ClusterCreateDrawerProps) {
  const { t } = useTranslation('web');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [argoCdEnabled, setArgoCdEnabled] = useState(false);

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      argoCdEnabled,
    });
  };

  const handleClose = () => {
    setName('');
    setDescription('');
    setArgoCdEnabled(false);
    onClose();
  };

  return (
    <BaseDrawer
      open={open}
      onClose={handleClose}
      modal
      title={t('cluster.createTitle')}
      size="sm"
      data-testid="cluster-create-drawer"
      header={
        <div className="px-2">
          <h2 className="text-lg font-semibold">{t('cluster.createTitle')}</h2>
          <p className="text-muted-foreground text-sm">{t('cluster.createDescription')}</p>
        </div>
      }
      footer={
        <Button
          data-testid="cluster-create-submit"
          onClick={handleSubmit}
          disabled={!name.trim() || loading}
          className="w-full"
        >
          {loading ? t('cluster.creating') : t('cluster.createAndProvision')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 overflow-y-auto p-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="cluster-name">{t('cluster.nameLabel')}</Label>
          <Input
            id="cluster-name"
            data-testid="cluster-create-name-input"
            placeholder={t('cluster.namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit();
            }}
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="cluster-description">{t('cluster.descriptionLabel')}</Label>
          <Textarea
            id="cluster-description"
            data-testid="cluster-create-description-input"
            placeholder={t('cluster.descriptionPlaceholder')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="cluster-argocd">{t('cluster.argoCdLabel')}</Label>
            <span className="text-muted-foreground text-xs">{t('cluster.argoCdDescription')}</span>
          </div>
          <Switch
            id="cluster-argocd"
            data-testid="cluster-create-argocd-toggle"
            checked={argoCdEnabled}
            onCheckedChange={setArgoCdEnabled}
          />
        </div>
      </div>
    </BaseDrawer>
  );
}

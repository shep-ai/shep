import type { Meta, StoryObj } from '@storybook/react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './sheet';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';

const meta = {
  title: 'Primitives/Sheet',
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Sheet</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit profile</SheetTitle>
          <SheetDescription>Update your public profile details.</SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 px-4">
          <div className="grid gap-2">
            <Label htmlFor="sheet-name">Name</Label>
            <Input id="sheet-name" defaultValue="Pedro Duarte" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sheet-username">Username</Label>
            <Input id="sheet-username" defaultValue="@peduarte" />
          </div>
        </div>
        <SheetFooter>
          <Button>Save changes</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

export const LeftSide: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Left Sheet</Button>
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>Left-side panel for navigation or filters.</SheetDescription>
        </SheetHeader>
        <div className="space-y-2 px-4 text-sm">
          <p className="font-medium">Project</p>
          <p className="text-muted-foreground">Issues, pull requests, and releases.</p>
        </div>
      </SheetContent>
    </Sheet>
  ),
};

export const TopSide: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Top Sheet</Button>
      </SheetTrigger>
      <SheetContent side="top">
        <SheetHeader>
          <SheetTitle>Deployment queued</SheetTitle>
          <SheetDescription>Top sheets work well for compact status updates.</SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  ),
};

export const BottomSide: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Bottom Sheet</Button>
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Command palette</SheetTitle>
          <SheetDescription>Bottom sheets can hold mobile-first actions.</SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <Button variant="outline">Dismiss</Button>
          <Button>Run command</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

export const WithoutCloseButton: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Persistent Sheet</Button>
      </SheetTrigger>
      <SheetContent showCloseButton={false}>
        <SheetHeader>
          <SheetTitle>Persistent panel</SheetTitle>
          <SheetDescription>
            This variant hides the default close button for custom action layouts.
          </SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <Button>Primary action</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

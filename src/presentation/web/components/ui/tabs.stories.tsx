import type { Meta, StoryObj } from '@storybook/react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';
import { Input } from './input';
import { Label } from './label';

const meta: Meta<typeof Tabs> = {
  title: 'Primitives/Tabs',
  component: Tabs,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="account" className="w-[400px]">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="password">Password</TabsTrigger>
      </TabsList>
      <TabsContent value="account">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>
              Make changes to your account here. Click save when you&apos;re done.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="space-y-1">
              <Label htmlFor="name">Name</Label>
              <Input id="name" defaultValue="Pedro Duarte" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="username">Username</Label>
              <Input id="username" defaultValue="@peduarte" />
            </div>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="password">
        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>
              Change your password here. After saving, you&apos;ll be logged out.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="space-y-1">
              <Label htmlFor="current">Current password</Label>
              <Input id="current" type="password" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new">New password</Label>
              <Input id="new" type="password" />
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  ),
};

export const Simple: Story = {
  render: () => (
    <Tabs defaultValue="tab1" className="w-[400px]">
      <TabsList>
        <TabsTrigger value="tab1">Tab 1</TabsTrigger>
        <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        <TabsTrigger value="tab3">Tab 3</TabsTrigger>
      </TabsList>
      <TabsContent value="tab1" className="p-4">
        Content for Tab 1
      </TabsContent>
      <TabsContent value="tab2" className="p-4">
        Content for Tab 2
      </TabsContent>
      <TabsContent value="tab3" className="p-4">
        Content for Tab 3
      </TabsContent>
    </Tabs>
  ),
};

export const Disabled: Story = {
  render: () => (
    <Tabs defaultValue="tab1" className="w-[400px]">
      <TabsList>
        <TabsTrigger value="tab1">Active</TabsTrigger>
        <TabsTrigger value="tab2" disabled>
          Disabled
        </TabsTrigger>
        <TabsTrigger value="tab3">Active</TabsTrigger>
      </TabsList>
      <TabsContent value="tab1" className="p-4">
        First tab content
      </TabsContent>
      <TabsContent value="tab3" className="p-4">
        Third tab content
      </TabsContent>
    </Tabs>
  ),
};

export const Scrollable: Story = {
  render: () => (
    <div className="w-[500px] border border-dashed">
      <Tabs defaultValue="tab1">
        <TabsList scrollable className="w-full gap-0 rounded-none border-b p-0">
          <TabsTrigger value="tab1" className="rounded-none border-r px-4 py-2">
            Tab 1
          </TabsTrigger>
          <TabsTrigger value="tab2" className="rounded-none border-r px-4 py-2">
            Tab 2
          </TabsTrigger>
          <TabsTrigger value="tab3" className="rounded-none border-r px-4 py-2">
            Tab 3
          </TabsTrigger>
          <TabsTrigger value="tab4" className="rounded-none border-r px-4 py-2">
            Tab 4
          </TabsTrigger>
          <TabsTrigger value="tab5" className="rounded-none border-r px-4 py-2">
            Tab 5
          </TabsTrigger>
          <TabsTrigger value="tab6" className="rounded-none border-r px-4 py-2">
            Tab 6
          </TabsTrigger>
          <TabsTrigger value="tab7" className="rounded-none border-r px-4 py-2">
            Tab 7
          </TabsTrigger>
          <TabsTrigger value="tab8" className="rounded-none border-r px-4 py-2">
            Tab 8
          </TabsTrigger>
          <TabsTrigger value="tab9" className="rounded-none border-r px-4 py-2">
            Tab 9
          </TabsTrigger>
          <TabsTrigger value="tab10" className="rounded-none border-r px-4 py-2">
            Tab 10
          </TabsTrigger>
          <TabsTrigger value="tab11" className="rounded-none px-4 py-2">
            Tab 11
          </TabsTrigger>
        </TabsList>
        <TabsContent value="tab1" className="p-4">
          Content for Tab 1
        </TabsContent>
        <TabsContent value="tab2" className="p-4">
          Content for Tab 2
        </TabsContent>
        <TabsContent value="tab3" className="p-4">
          Content for Tab 3
        </TabsContent>
        <TabsContent value="tab4" className="p-4">
          Content for Tab 4
        </TabsContent>
        <TabsContent value="tab5" className="p-4">
          Content for Tab 5
        </TabsContent>
        <TabsContent value="tab6" className="p-4">
          Content for Tab 6
        </TabsContent>
        <TabsContent value="tab7" className="p-4">
          Content for Tab 7
        </TabsContent>
        <TabsContent value="tab8" className="p-4">
          Content for Tab 8
        </TabsContent>
        <TabsContent value="tab9" className="p-4">
          Content for Tab 9
        </TabsContent>
        <TabsContent value="tab10" className="p-4">
          Content for Tab 10
        </TabsContent>
        <TabsContent value="tab11" className="p-4">
          Content for Tab 11
        </TabsContent>
      </Tabs>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Demonstrates horizontal scrolling behavior when tabs exceed container width. The TabsList with `scrollable` prop applies `overflow-x-auto overflow-y-hidden` classes, allowing users to scroll through tabs via mouse wheel, trackpad, or keyboard navigation (Arrow Left/Right). All 11 tabs are accessible regardless of scroll position.',
      },
    },
  },
};

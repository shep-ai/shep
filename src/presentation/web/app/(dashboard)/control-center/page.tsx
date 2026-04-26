/** Skip static pre-rendering since we need runtime DI container and server context. */
export const dynamic = 'force-dynamic';

/** Canvas is rendered by the layout; this page is just a route target for `/`. */
export default function HomePage() {
  return null;
}

import { TimeSink, TimeSinkConfig } from './sink';

//factory to build a TimeSink from its config
type Factory = (cfg: TimeSinkConfig) => TimeSink;

export class SinkRegistry {
  private factories = new Map<string, Factory>();
  register(kind: string, factory: Factory) {
    if (this.factories.has(kind)) {throw new Error(`Sink "${kind}" already registered`);}
    this.factories.set(kind, factory);
  }
 /**
   * Instantiate sinks for the given configs.
   * NOTE: No validation here — hydration/prompting happens in the orchestrator.
   */
  create(configs: TimeSinkConfig[]): TimeSink[] {
    const out: TimeSink[] = [];
    for (const c of configs) {
      if (!c?.enabled) {continue;}

      const factory = this.factories.get(c.kind);
      if (!factory) {
        console.warn(`Clockit: no factory for kind=${c.kind}, skipping`);
        continue;
      }

      try {
        const sink = factory(c);
        out.push(sink);
      } catch (e) {
        console.warn(`Clockit: failed to construct sink kind=${c.kind}:`, e);
      }
    }
    return out;
  }
}
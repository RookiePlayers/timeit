"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const registry_1 = require("../src/core/registry");
class OkSink {
    cfg;
    kind = 'ok';
    constructor(cfg) {
        this.cfg = cfg;
    }
    validate() { return { ok: true }; }
    async export() { return { ok: true, message: 'ok' }; }
}
class BadSink {
    cfg;
    kind = 'bad';
    constructor(cfg) {
        this.cfg = cfg;
    }
    validate() { return { ok: false, missing: ['x'] }; }
    async export() { return { ok: true, message: 'bad' }; }
}
describe('SinkRegistry', () => {
    it('creates known sinks', () => {
        const r = new registry_1.SinkRegistry();
        r.register('ok', (c) => new OkSink(c));
        const sinks = r.create([{ kind: 'ok', enabled: true, options: {} }]);
        expect(sinks).toHaveLength(1);
        expect(sinks[0].kind).toBe('ok');
    });
    it('skips unknown kind without throwing', () => {
        const r = new registry_1.SinkRegistry();
        const sinks = r.create([{ kind: 'nope', enabled: true, options: {} }]);
        expect(sinks).toHaveLength(0);
    });
    it('ignores disabled configs', () => {
        const r = new registry_1.SinkRegistry();
        r.register('ok', (c) => new OkSink(c));
        const sinks = r.create([{ kind: 'ok', enabled: false, options: {} }]);
        expect(sinks).toHaveLength(0);
    });
});
//# sourceMappingURL=core.registry.test.js.map
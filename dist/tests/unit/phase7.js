import { createDefaultState } from '../../src/shared/state-defaults.js';
import { computeRecentChanges, narrativeTimestampFromState } from '../../src/shared/recent-changes.js';
import { injectNarrativeHistoryContext } from '../../src/lumi/history-metadata.js';
let passed = 0;
function assert(value, message) {
    if (!value)
        throw new Error('ASSERT: ' + message);
    passed += 1;
}
function main() {
    const base = createDefaultState();
    base.World.Date[0] = '1 июня, среда';
    base.World.Time[0] = '11:00';
    const stamp = narrativeTimestampFromState(base);
    assert(stamp.date === '1 июня, среда' && stamp.time === '11:00', 'narrative timestamp is derived only from in-world World.Date/World.Time');
    const same = structuredClone(base);
    same.Mainchar.Outfit.Worn['Шапка'] = {
        Name: 'Шапка', Type: 'Clothing', Slot: 'Head', Layer: 'Base',
        Placement: 'голова', Color: 'серая', Material: 'шерсть',
        Appearance: 'простая шапка', Condition: 'intact', Arrangement: 'надета',
    };
    const sameFinal = structuredClone(same);
    assert(computeRecentChanges(same, sameFinal) === null, 'net change model suppresses reverted/intermediate GUI activity when final state equals last delivered state');
    const outfitAfter = structuredClone(same);
    delete outfitAfter.Mainchar.Outfit.Worn['Шапка'];
    outfitAfter.Mainchar.Outfit.Worn['Шляпа'] = {
        Name: 'Колдовская шляпа', Type: 'Clothing', Slot: 'Head', Layer: 'Outerwear',
        Placement: 'голова', Color: 'оливковый', Material: 'сукно',
        Appearance: 'широкополая шляпа', Condition: 'intact', Arrangement: 'надета',
    };
    outfitAfter.World.Time[0] = '11:08';
    const outfitDiff = computeRecentChanges(same, outfitAfter);
    const playerOutfit = outfitDiff?.Outfit?.player;
    assert(Boolean(playerOutfit) && outfitDiff?.observedAt.time === '11:08', 'outfit transition is emitted with current narrative timestamp');
    assert(JSON.stringify(playerOutfit).includes('Шапка') && JSON.stringify(playerOutfit).includes('Колдовская шляпа'), 'outfit diff reports removed and added clothes');
    const domainsAfter = structuredClone(same);
    domainsAfter.World.Location[0] = 'Дервендег, рынок';
    domainsAfter.Mainchar.Inventory['Монеты'] = { Name: 'Серебро', Type: 'Money', Qty: 5, Desc: '' };
    domainsAfter.Mainchar.Strength[0] = 6;
    domainsAfter.Narrative.Relationships.rel_test = {
        A: 'player', B: 'Evelyn', Bond: 10, Sparks: 20, Grudge: 0,
        Dynamic: 'спутники', LastShift: 'стали ближе', LastShiftTurn: 2,
    };
    const domainDiff = computeRecentChanges(same, domainsAfter);
    assert(domainDiff?.Location?.to === 'Дервендег, рынок', 'location off-screen change is tracked');
    assert(Boolean(domainDiff?.Inventory?.player) && domainDiff?.Stats?.Strength?.to === 6, 'inventory and stat off-screen changes are tracked');
    assert(Boolean(domainDiff?.Relationships?.rel_test), 'relationship off-screen change is tracked');
    const messages = [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'Я иду.', __isChatHistory: true, sourceMessageId: 'u1' },
        { role: 'assistant', content: 'Эвелин идёт следом.', __isChatHistory: true, sourceMessageId: 'a1' },
    ];
    const injected = injectNarrativeHistoryContext(messages, { a1: { date: '1 июня, среда', time: '11:00' } }, outfitDiff);
    const user = injected.find(message => message.sourceMessageId === 'u1');
    const assistant = injected.find(message => message.sourceMessageId === 'a1');
    const system = injected.find(message => message.role === 'system');
    assert(typeof user?.content === 'string' && !user.content.includes('narrative_time'), 'user messages never receive narrative timestamps');
    assert(typeof assistant?.content === 'string' && assistant.content.startsWith('<narrative_time date="1 июня, среда" time="11:00"/>'), 'assistant history receives in-world timestamp metadata');
    assert(typeof system?.content === 'string' && system.content.includes('not real-world clock time') && system.content.includes('<RECENT_CHANGES>'), 'history rules explicitly separate narrative time from real time and carry net recent changes');
    const untouched = injectNarrativeHistoryContext(messages, {}, null);
    assert(JSON.stringify(untouched) === JSON.stringify(messages), 'no metadata is injected when no proven timestamps or recent changes exist');
    console.log(`phase7 narrative history tests passed: ${passed}`);
}
main();
//# sourceMappingURL=phase7.js.map
import type { CommandAction } from '../../../components/CommandPalette';

type ActionFlowLike = {
  intentKey?: string | null;
  intentLabel?: string | null;
  symbol?: string | null;
  timeframe?: string | null;
  sequence?: string[] | null;
};

export interface BuildCommandActionsModelInput {
  recommendedActionFlowsState: ActionFlowLike[];
  runRecommendedActionFlow: (flow: ActionFlowLike) => void;
  symbolScopeSymbol?: string | null;
  activeBrokerSymbol?: string | null;
  activeTvSymbol?: string | null;
  symbolScopeTimeframesLabel?: string | null;
  activeTvTimeframeLabel?: string | null;
  openSymbolPanel: (target: 'nativechart' | 'mt5' | 'tradelocker', symbol: string) => void;
  openSidebarMode: (mode: string) => void;
  isOpen: boolean;
  toggleSidebar: () => void;
  openSettings: () => void;
  toggleFullscreen: () => void;
  captureContextPack: (opts: { copy?: boolean; save?: boolean }) => void;
}

export const buildCommandActionsModel = (input: BuildCommandActionsModelInput): CommandAction[] => {
  const flowActions: CommandAction[] = Array.isArray(input.recommendedActionFlowsState)
    ? input.recommendedActionFlowsState.slice(0, 8).map((flow, index) => {
        const label = flow.intentLabel || flow.intentKey || 'Action Flow';
        const meta = [flow.symbol, flow.timeframe].filter(Boolean).join(' ');
        const sequence = Array.isArray(flow.sequence) ? flow.sequence.join(' > ') : '';
        return {
          id: `flow-${flow.intentKey}-${index}`,
          label: `Run Flow: ${label}`,
          group: 'Flows',
          hint: [meta, sequence].filter(Boolean).join(' | '),
          onSelect: () => input.runRecommendedActionFlow(flow)
        } as CommandAction;
      })
    : [];

  const paletteSymbol = String(input.symbolScopeSymbol || input.activeBrokerSymbol || input.activeTvSymbol || '').trim();
  const paletteTimeframe = String(input.symbolScopeTimeframesLabel || input.activeTvTimeframeLabel || '').trim();

  const symbolActions: CommandAction[] = paletteSymbol
    ? [
        {
          id: 'open-symbol-chart',
          label: `Open ${paletteSymbol} in Chart`,
          group: 'Symbol',
          hint: paletteTimeframe || undefined,
          onSelect: () => input.openSymbolPanel('nativechart', paletteSymbol)
        },
        {
          id: 'open-symbol-mt5',
          label: `Open ${paletteSymbol} in MT5`,
          group: 'Symbol',
          hint: paletteTimeframe || undefined,
          onSelect: () => input.openSymbolPanel('mt5', paletteSymbol)
        },
        {
          id: 'open-symbol-tradelocker',
          label: `Open ${paletteSymbol} in TradeLocker`,
          group: 'Symbol',
          hint: paletteTimeframe || undefined,
          onSelect: () => input.openSymbolPanel('tradelocker', paletteSymbol)
        }
      ]
    : [];

  return [
    { id: 'open-chat', label: 'Open Chat', group: 'Panels', onSelect: () => input.openSidebarMode('chartchat') },
    { id: 'open-signal', label: 'Open Signal', group: 'Panels', onSelect: () => input.openSidebarMode('signal') },
    { id: 'open-snapshot', label: 'Open Snapshot', group: 'Panels', onSelect: () => input.openSidebarMode('snapshot') },
    { id: 'open-patterns', label: 'Open Patterns', group: 'Panels', onSelect: () => input.openSidebarMode('patterns') },
    { id: 'open-shadow', label: 'Open Shadow', group: 'Panels', onSelect: () => input.openSidebarMode('shadow') },
    { id: 'open-calendar', label: 'Open Calendar', group: 'Panels', onSelect: () => input.openSidebarMode('calendar') },
    { id: 'open-notes', label: 'Open Notes', group: 'Panels', onSelect: () => input.openSidebarMode('notes') },
    { id: 'open-autopilot', label: 'Open AutoPilot', group: 'Panels', onSelect: () => input.openSidebarMode('autopilot') },
    { id: 'open-tradelocker', label: 'Open TradeLocker', group: 'Panels', onSelect: () => input.openSidebarMode('tradelocker') },
    { id: 'open-chart', label: 'Open Native Chart', group: 'Panels', onSelect: () => input.openSidebarMode('nativechart') },
    { id: 'open-backtester', label: 'Open Backtester', group: 'Panels', onSelect: () => input.openSidebarMode('backtester') },
    { id: 'open-setups', label: 'Open Setups', group: 'Panels', onSelect: () => input.openSidebarMode('setups') },
    { id: 'open-agent-creator', label: 'Open Agent', group: 'Panels', onSelect: () => input.openSidebarMode('agentcreator') },
    { id: 'open-memory', label: 'Open Memory', group: 'Panels', onSelect: () => input.openSidebarMode('agentmemory') },
    { id: 'open-agent-lab', label: 'Open Agent Lab', group: 'Panels', onSelect: () => input.openSidebarMode('agentlab') },
    { id: 'open-academy', label: 'Open Academy', group: 'Panels', onSelect: () => input.openSidebarMode('academy') },
    { id: 'open-monitor', label: 'Open Monitor', group: 'Panels', onSelect: () => input.openSidebarMode('monitor') },
    { id: 'open-audit', label: 'Open Audit Trail', group: 'Panels', onSelect: () => input.openSidebarMode('audit') },
    { id: 'open-changes', label: 'Open Changes', group: 'Panels', onSelect: () => input.openSidebarMode('changes') },
    {
      id: 'toggle-sidebar',
      label: input.isOpen ? 'Hide Sidebar' : 'Show Sidebar',
      group: 'System',
      onSelect: () => input.toggleSidebar()
    },
    { id: 'open-settings', label: 'Open Settings', group: 'System', shortcut: 'Ctrl+,', onSelect: () => input.openSettings() },
    { id: 'toggle-fullscreen', label: 'Toggle Fullscreen', group: 'System', shortcut: 'F11', onSelect: () => input.toggleFullscreen() },
    {
      id: 'context-pack-copy',
      label: 'Context Pack: Copy',
      group: 'Context',
      hint: 'Copy the agent context snapshot',
      onSelect: () => input.captureContextPack({ copy: true })
    },
    {
      id: 'context-pack-save',
      label: 'Context Pack: Save',
      group: 'Context',
      hint: 'Save to agent memory',
      onSelect: () => input.captureContextPack({ save: true })
    },
    ...symbolActions,
    ...flowActions
  ];
};

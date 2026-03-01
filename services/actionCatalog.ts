import { ActionDefinition, AgentToolActionType, BrokerActionType } from '../types';

export const ACTION_CATALOG: Record<string, ActionDefinition> = {
  'system.snapshot': {
    id: 'system.snapshot',
    domain: 'system',
    owner: 'agent',
    summary: 'Fetch consolidated system state snapshot.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'agent_tool_system_snapshot',
    defaultTimeoutMs: 4000
  },
  'agent_runner.status': {
    id: 'agent_runner.status',
    domain: 'system',
    owner: 'agent',
    summary: 'Fetch agent runner status.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'agent_runner_status',
    defaultTimeoutMs: 2000
  },
  'agent_runner.cancel': {
    id: 'agent_runner.cancel',
    domain: 'system',
    owner: 'agent',
    summary: 'Cancel an in-flight agent runner session.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'agent_runner_cancel',
    defaultTimeoutMs: 2000
  },
  'system.capture_snapshot': {
    id: 'system.capture_snapshot',
    domain: 'system',
    owner: 'agent',
    summary: 'Capture a native snapshot of the app window.',
    safety: { gates: ['permissions'], requiresConfirmation: false },
    auditEventType: 'agent_tool_system_capture',
    defaultTimeoutMs: 4000
  },
  'action_flow.list': {
    id: 'action_flow.list',
    domain: 'system',
    owner: 'agent',
    summary: 'List learned action flow recommendations.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'action_flow_list',
    defaultTimeoutMs: 2000
  },
  'action_flow.run': {
    id: 'action_flow.run',
    domain: 'system',
    owner: 'agent',
    summary: 'Run a learned action flow by intent key.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'action_flow_run',
    defaultTimeoutMs: 4000
  },
  'session.bias.set': {
    id: 'session.bias.set',
    domain: 'system',
    owner: 'agent',
    summary: 'Set the session bias for the trading team.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'session_bias_set',
    defaultTimeoutMs: 2000
  },
  'symbol.scope.set': {
    id: 'symbol.scope.set',
    domain: 'system',
    owner: 'agent',
    summary: 'Set the global symbol scope and default timeframes.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'symbol_scope_set',
    defaultTimeoutMs: 2000
  },
  'symbol.scope.clear': {
    id: 'symbol.scope.clear',
    domain: 'system',
    owner: 'agent',
    summary: 'Clear the global symbol scope.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'symbol_scope_clear',
    defaultTimeoutMs: 2000
  },
  'chat.reply_mode.set': {
    id: 'chat.reply_mode.set',
    domain: 'chat',
    owner: 'agent',
    summary: 'Set chat reply mode (single/team).',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'chat_reply_mode_set',
    defaultTimeoutMs: 2000
  },
  'chat.clear': {
    id: 'chat.clear',
    domain: 'chat',
    owner: 'agent',
    summary: 'Clear the chat conversation.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'chat_clear',
    defaultTimeoutMs: 2000
  },
  'chat.playbook.default.set': {
    id: 'chat.playbook.default.set',
    domain: 'chat',
    owner: 'agent',
    summary: 'Set the default playbook used in Chat.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'chat_playbook_default_set',
    defaultTimeoutMs: 2000
  },
  'chat.attachment.set': {
    id: 'chat.attachment.set',
    domain: 'chat',
    owner: 'agent',
    summary: 'Set or clear the chat attachment.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'chat_attachment_set',
    defaultTimeoutMs: 2000
  },
  'chat.snapshot.capture': {
    id: 'chat.snapshot.capture',
    domain: 'chat',
    owner: 'agent',
    summary: 'Capture the active tab and attach to chat.',
    requiresVision: true,
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'chat_snapshot_capture',
    defaultTimeoutMs: 6000
  },
  'chat.snapshot.send': {
    id: 'chat.snapshot.send',
    domain: 'chat',
    owner: 'agent',
    summary: 'Capture and send tab snapshots to chat.',
    requiresVision: true,
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'chat_snapshot_send',
    defaultTimeoutMs: 8000
  },
  'chat.send': {
    id: 'chat.send',
    domain: 'chat',
    owner: 'agent',
    summary: 'Send a chat message through the active assistant.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'chat_send',
    defaultTimeoutMs: 4000
  },
  'chat.auto_tab_vision.set': {
    id: 'chat.auto_tab_vision.set',
    domain: 'chat',
    owner: 'agent',
    summary: 'Toggle auto tab vision for chat.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'chat_auto_tab_vision_set',
    defaultTimeoutMs: 2000
  },
  'trade.execute': {
    id: 'trade.execute',
    domain: 'broker',
    owner: 'agent',
    summary: 'Execute a pending trade proposal.',
    requiresBroker: true,
    safety: { gates: ['confirmation', 'permissions', 'risk'], requiresConfirmation: false },
    auditEventType: 'trade_execute',
    defaultTimeoutMs: 8000
  },
  'trade.reject': {
    id: 'trade.reject',
    domain: 'broker',
    owner: 'agent',
    summary: 'Reject a pending trade proposal.',
    requiresBroker: true,
    safety: { gates: ['confirmation'], requiresConfirmation: false },
    auditEventType: 'trade_reject',
    defaultTimeoutMs: 4000
  },
  'broker.action.execute': {
    id: 'broker.action.execute',
    domain: 'broker',
    owner: 'agent',
    summary: 'Execute a pending broker action.',
    requiresBroker: true,
    safety: { gates: ['confirmation', 'permissions', 'risk'], requiresConfirmation: false },
    auditEventType: 'broker_action_execute',
    defaultTimeoutMs: 8000
  },
  'broker.action.reject': {
    id: 'broker.action.reject',
    domain: 'broker',
    owner: 'agent',
    summary: 'Reject a pending broker action.',
    requiresBroker: true,
    safety: { gates: ['confirmation'], requiresConfirmation: false },
    auditEventType: 'broker_action_reject',
    defaultTimeoutMs: 4000
  },
  'live.start': {
    id: 'live.start',
    domain: 'chat',
    owner: 'agent',
    summary: 'Start a live session (camera/screen/audio).',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'live_start',
    defaultTimeoutMs: 8000
  },
  'live.stop': {
    id: 'live.stop',
    domain: 'chat',
    owner: 'agent',
    summary: 'Stop the live session.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'live_stop',
    defaultTimeoutMs: 4000
  },
  'live.mute': {
    id: 'live.mute',
    domain: 'chat',
    owner: 'agent',
    summary: 'Mute live session audio capture.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'live_mute',
    defaultTimeoutMs: 2000
  },
  'live.unmute': {
    id: 'live.unmute',
    domain: 'chat',
    owner: 'agent',
    summary: 'Unmute live session audio capture.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'live_unmute',
    defaultTimeoutMs: 2000
  },
  'post_trade_review.enable': {
    id: 'post_trade_review.enable',
    domain: 'chat',
    owner: 'agent',
    summary: 'Enable post-trade review automation.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'post_trade_review_enable',
    defaultTimeoutMs: 2000
  },
  'post_trade_review.disable': {
    id: 'post_trade_review.disable',
    domain: 'chat',
    owner: 'agent',
    summary: 'Disable post-trade review automation.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'post_trade_review_disable',
    defaultTimeoutMs: 2000
  },
  'post_trade_review.agent.set': {
    id: 'post_trade_review.agent.set',
    domain: 'chat',
    owner: 'agent',
    summary: 'Set the agent to run post-trade reviews.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'post_trade_review_agent_set',
    defaultTimeoutMs: 2000
  },
  'post_trade_review.run_last': {
    id: 'post_trade_review.run_last',
    domain: 'chat',
    owner: 'agent',
    summary: 'Run post-trade review for the most recent closed trade.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'post_trade_review_run_last',
    defaultTimeoutMs: 4000
  },
  'settings.openai.key.set': {
    id: 'settings.openai.key.set',
    domain: 'settings',
    owner: 'agent',
    summary: 'Store the OpenAI API key in secure storage.',
    safety: { gates: ['permissions'], requiresConfirmation: false },
    auditEventType: 'settings_openai_key_set',
    defaultTimeoutMs: 6000
  },
  'settings.openai.key.clear': {
    id: 'settings.openai.key.clear',
    domain: 'settings',
    owner: 'agent',
    summary: 'Clear the OpenAI API key from secure storage.',
    safety: { gates: ['permissions'], requiresConfirmation: false },
    auditEventType: 'settings_openai_key_clear',
    defaultTimeoutMs: 6000
  },
  'settings.openai.vector_store.set': {
    id: 'settings.openai.vector_store.set',
    domain: 'settings',
    owner: 'agent',
    summary: 'Set OpenAI vector store ids for file search.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'settings_openai_vector_store_set',
    defaultTimeoutMs: 2000
  },
  'settings.openai.reasoning_effort.set': {
    id: 'settings.openai.reasoning_effort.set',
    domain: 'settings',
    owner: 'agent',
    summary: 'Set tech agent reasoning effort (GPT-5.2).',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'settings_openai_reasoning_effort_set',
    defaultTimeoutMs: 2000
  },
  'settings.gemini.key.set': {
    id: 'settings.gemini.key.set',
    domain: 'settings',
    owner: 'agent',
    summary: 'Store the Gemini API key in secure storage.',
    safety: { gates: ['permissions'], requiresConfirmation: false },
    auditEventType: 'settings_gemini_key_set',
    defaultTimeoutMs: 6000
  },
  'settings.gemini.key.clear': {
    id: 'settings.gemini.key.clear',
    domain: 'settings',
    owner: 'agent',
    summary: 'Clear the Gemini API key from secure storage.',
    safety: { gates: ['permissions'], requiresConfirmation: false },
    auditEventType: 'settings_gemini_key_clear',
    defaultTimeoutMs: 6000
  },
  'settings.model.text.set': {
    id: 'settings.model.text.set',
    domain: 'settings',
    owner: 'agent',
    summary: 'Set OpenAI text model preference.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'settings_model_text_set',
    defaultTimeoutMs: 2000
  },
  'settings.model.vision.set': {
    id: 'settings.model.vision.set',
    domain: 'settings',
    owner: 'agent',
    summary: 'Set OpenAI vision model preference.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'settings_model_vision_set',
    defaultTimeoutMs: 2000
  },
  'settings.model.vision_detail.set': {
    id: 'settings.model.vision_detail.set',
    domain: 'settings',
    owner: 'agent',
    summary: 'Set OpenAI vision detail preference.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'settings_model_vision_detail_set',
    defaultTimeoutMs: 2000
  },
  'settings.model.live.set': {
    id: 'settings.model.live.set',
    domain: 'settings',
    owner: 'agent',
    summary: 'Set OpenAI live model preference.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'settings_model_live_set',
    defaultTimeoutMs: 2000
  },
  'settings.vision_interval.active.set': {
    id: 'settings.vision_interval.active.set',
    domain: 'settings',
    owner: 'agent',
    summary: 'Set active tab vision interval (ms).',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'settings_vision_interval_active_set',
    defaultTimeoutMs: 2000
  },
  'settings.vision_interval.watched.set': {
    id: 'settings.vision_interval.watched.set',
    domain: 'settings',
    owner: 'agent',
    summary: 'Set watched tab vision interval (ms).',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'settings_vision_interval_watched_set',
    defaultTimeoutMs: 2000
  },
  'settings.chart_watch_interval.set': {
    id: 'settings.chart_watch_interval.set',
    domain: 'settings',
    owner: 'agent',
    summary: 'Set chart watch interval (ms).',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'settings_chart_watch_interval_set',
    defaultTimeoutMs: 2000
  },
  'settings.auto_watch_tradingview.set': {
    id: 'settings.auto_watch_tradingview.set',
    domain: 'settings',
    owner: 'agent',
    summary: 'Toggle auto-watch TradingView tabs.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'settings_auto_watch_tradingview_set',
    defaultTimeoutMs: 2000
  },
  'settings.chat_context.mode.set': {
    id: 'settings.chat_context.mode.set',
    domain: 'settings',
    owner: 'agent',
    summary: 'Set chat tab context mode.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'settings_chat_context_mode_set',
    defaultTimeoutMs: 2000
  },
  'settings.chat_context.max_tabs.set': {
    id: 'settings.chat_context.max_tabs.set',
    domain: 'settings',
    owner: 'agent',
    summary: 'Set chat tab context max tabs.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'settings_chat_context_max_tabs_set',
    defaultTimeoutMs: 2000
  },
  'settings.chat_context.change_only.set': {
    id: 'settings.chat_context.change_only.set',
    domain: 'settings',
    owner: 'agent',
    summary: 'Toggle chat context change-only capture.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'settings_chat_context_change_only_set',
    defaultTimeoutMs: 2000
  },
  'settings.chat_context.roi.set': {
    id: 'settings.chat_context.roi.set',
    domain: 'settings',
    owner: 'agent',
    summary: 'Set chat tab context ROI preset.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'settings_chat_context_roi_set',
    defaultTimeoutMs: 2000
  },
  'settings.chat_context.redaction.set': {
    id: 'settings.chat_context.redaction.set',
    domain: 'settings',
    owner: 'agent',
    summary: 'Set chat tab context redaction preset.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'settings_chat_context_redaction_set',
    defaultTimeoutMs: 2000
  },
  'settings.broker.set_active': {
    id: 'settings.broker.set_active',
    domain: 'settings',
    owner: 'agent',
    summary: 'Set active broker adapter.',
    safety: { gates: ['permissions'], requiresConfirmation: false },
    auditEventType: 'settings_broker_set_active',
    defaultTimeoutMs: 4000
  },
  'ledger.flush': {
    id: 'ledger.flush',
    domain: 'ledger',
    owner: 'agent',
    summary: 'Flush trade ledger to disk.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'ledger_flush',
    defaultTimeoutMs: 4000
  },
  'ui.sidebar.setMode': {
    id: 'ui.sidebar.setMode',
    domain: 'ui',
    owner: 'agent',
    summary: 'Set sidebar mode (optionally open the sidebar).',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'ui_sidebar_set_mode',
    defaultTimeoutMs: 2000
  },
  'ui.sidebar.open': {
    id: 'ui.sidebar.open',
    domain: 'ui',
    owner: 'agent',
    summary: 'Open the sidebar.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'ui_sidebar_open',
    defaultTimeoutMs: 2000
  },
  'ui.sidebar.close': {
    id: 'ui.sidebar.close',
    domain: 'ui',
    owner: 'agent',
    summary: 'Close the sidebar.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'ui_sidebar_close',
    defaultTimeoutMs: 2000
  },
  'ui.sidebar.toggle': {
    id: 'ui.sidebar.toggle',
    domain: 'ui',
    owner: 'agent',
    summary: 'Toggle sidebar visibility.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'ui_sidebar_toggle',
    defaultTimeoutMs: 2000
  },
  'ui.panel.open': {
    id: 'ui.panel.open',
    domain: 'ui',
    owner: 'agent',
    summary: 'Open a specific sidebar panel.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'ui_panel_open',
    defaultTimeoutMs: 2000
  },
  'ui.modal.open': {
    id: 'ui.modal.open',
    domain: 'ui',
    owner: 'agent',
    summary: 'Open a modal dialog (settings).',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'ui_modal_open',
    defaultTimeoutMs: 2000
  },
  'ui.modal.close': {
    id: 'ui.modal.close',
    domain: 'ui',
    owner: 'agent',
    summary: 'Close a modal dialog (settings).',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'ui_modal_close',
    defaultTimeoutMs: 2000
  },
  'ui.command_palette.open': {
    id: 'ui.command_palette.open',
    domain: 'ui',
    owner: 'agent',
    summary: 'Open the command palette.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'ui_command_palette_open',
    defaultTimeoutMs: 2000
  },
  'ui.command_palette.close': {
    id: 'ui.command_palette.close',
    domain: 'ui',
    owner: 'agent',
    summary: 'Close the command palette.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'ui_command_palette_close',
    defaultTimeoutMs: 2000
  },
  'ui.command_palette.toggle': {
    id: 'ui.command_palette.toggle',
    domain: 'ui',
    owner: 'agent',
    summary: 'Toggle the command palette.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'ui_command_palette_toggle',
    defaultTimeoutMs: 2000
  },
  'ui.tab.open': {
    id: 'ui.tab.open',
    domain: 'ui',
    owner: 'agent',
    summary: 'Open a new browser tab with a URL.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'ui_tab_open',
    defaultTimeoutMs: 2000
  },
  'ui.tab.navigate': {
    id: 'ui.tab.navigate',
    domain: 'ui',
    owner: 'agent',
    summary: 'Navigate a tab to a URL.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'ui_tab_navigate',
    defaultTimeoutMs: 2000
  },
  'ui.tab.back': {
    id: 'ui.tab.back',
    domain: 'ui',
    owner: 'agent',
    summary: 'Navigate back in the active tab.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'ui_tab_back',
    defaultTimeoutMs: 2000
  },
  'ui.tab.forward': {
    id: 'ui.tab.forward',
    domain: 'ui',
    owner: 'agent',
    summary: 'Navigate forward in the active tab.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'ui_tab_forward',
    defaultTimeoutMs: 2000
  },
  'ui.tab.reload': {
    id: 'ui.tab.reload',
    domain: 'ui',
    owner: 'agent',
    summary: 'Reload the active tab.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'ui_tab_reload',
    defaultTimeoutMs: 2000
  },
  'ui.tab.switch': {
    id: 'ui.tab.switch',
    domain: 'ui',
    owner: 'agent',
    summary: 'Switch to a browser tab by id, index, or url.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'ui_tab_switch',
    defaultTimeoutMs: 2000
  },
  'ui.tab.close': {
    id: 'ui.tab.close',
    domain: 'ui',
    owner: 'agent',
    summary: 'Close a browser tab by id, index, or url.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'ui_tab_close',
    defaultTimeoutMs: 2000
  },
  'ui.tab.pin': {
    id: 'ui.tab.pin',
    domain: 'ui',
    owner: 'agent',
    summary: 'Pin/unpin a tab for AI context.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'ui_tab_pin',
    defaultTimeoutMs: 2000
  },
  'ui.tab.label.set': {
    id: 'ui.tab.label.set',
    domain: 'ui',
    owner: 'agent',
    summary: 'Set AI label for a browser tab.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'ui_tab_label_set',
    defaultTimeoutMs: 2000
  },
  'ui.tab.watch': {
    id: 'ui.tab.watch',
    domain: 'ui',
    owner: 'agent',
    summary: 'Watch/unwatch a tab for background chart watch.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'ui_tab_watch',
    defaultTimeoutMs: 2000
  },
  'ui.window.fullscreen.toggle': {
    id: 'ui.window.fullscreen.toggle',
    domain: 'ui',
    owner: 'agent',
    summary: 'Toggle application fullscreen mode.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'ui_window_fullscreen_toggle',
    defaultTimeoutMs: 2000
  },
  'tradelocker.view.set': {
    id: 'tradelocker.view.set',
    domain: 'ui',
    owner: 'agent',
    summary: 'Set active TradeLocker panel view.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'tradelocker_view_set',
    defaultTimeoutMs: 2000
  },
  'tradelocker.ticket.set': {
    id: 'tradelocker.ticket.set',
    domain: 'ui',
    owner: 'agent',
    summary: 'Update TradeLocker ticket inputs.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'tradelocker_ticket_set',
    defaultTimeoutMs: 2000
  },
  'tradelocker.orders.filters.set': {
    id: 'tradelocker.orders.filters.set',
    domain: 'ui',
    owner: 'agent',
    summary: 'Update TradeLocker orders filters.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'tradelocker_orders_filters_set',
    defaultTimeoutMs: 2000
  },
  'tradelocker.history.filters.set': {
    id: 'tradelocker.history.filters.set',
    domain: 'ui',
    owner: 'agent',
    summary: 'Update TradeLocker history filters.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'tradelocker_history_filters_set',
    defaultTimeoutMs: 2000
  },
  'tradelocker.close_panel.set': {
    id: 'tradelocker.close_panel.set',
    domain: 'ui',
    owner: 'agent',
    summary: 'Update TradeLocker close position panel.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'tradelocker_close_panel_set',
    defaultTimeoutMs: 2000
  },
  'backtester.config.set': {
    id: 'backtester.config.set',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Update Backtester panel config inputs.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'backtester_config_set',
    defaultTimeoutMs: 3000
  },
  'backtester.params.set': {
    id: 'backtester.params.set',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Update Backtester parameters for a strategy.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'backtester_params_set',
    defaultTimeoutMs: 3000
  },
  'backtester.optimizer.config.set': {
    id: 'backtester.optimizer.config.set',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Update Backtester optimizer config.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'backtester_optimizer_config_set',
    defaultTimeoutMs: 3000
  },
  'backtester.batch.config.set': {
    id: 'backtester.batch.config.set',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Update Backtester batch config inputs.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'backtester_batch_config_set',
    defaultTimeoutMs: 3000
  },
  'setups.library.filters.set': {
    id: 'setups.library.filters.set',
    domain: 'setup',
    owner: 'agent',
    summary: 'Update Setup Library filters.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'setups_library_filters_set',
    defaultTimeoutMs: 3000
  },
  'setups.compare.toggle': {
    id: 'setups.compare.toggle',
    domain: 'setup',
    owner: 'agent',
    summary: 'Toggle Setup Library compare selection.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'setups_compare_toggle',
    defaultTimeoutMs: 3000
  },
  'setups.playbook.draft.set': {
    id: 'setups.playbook.draft.set',
    domain: 'setup',
    owner: 'agent',
    summary: 'Update setup playbook draft fields.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'setups_playbook_draft_set',
    defaultTimeoutMs: 3000
  },
  'setups.playbook.save': {
    id: 'setups.playbook.save',
    domain: 'setup',
    owner: 'agent',
    summary: 'Save the active playbook draft for a watcher.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'setups_playbook_save',
    defaultTimeoutMs: 2000
  },
  'setups.playbook.reset': {
    id: 'setups.playbook.reset',
    domain: 'setup',
    owner: 'agent',
    summary: 'Reset the playbook draft for a watcher.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'setups_playbook_reset',
    defaultTimeoutMs: 2000
  },
  'setups.playbook.create.toggle': {
    id: 'setups.playbook.create.toggle',
    domain: 'setup',
    owner: 'agent',
    summary: 'Toggle the new watcher playbook editor in Setups.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'setups_playbook_create_toggle',
    defaultTimeoutMs: 2000
  },
  'setups.playbook.editor.toggle': {
    id: 'setups.playbook.editor.toggle',
    domain: 'setup',
    owner: 'agent',
    summary: 'Toggle setup playbook editor visibility for a watcher.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'setups_playbook_editor_toggle',
    defaultTimeoutMs: 2000
  },
  'setups.apply_to_backtester': {
    id: 'setups.apply_to_backtester',
    domain: 'setup',
    owner: 'agent',
    summary: 'Apply watcher params to the Backtester.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'setups_apply_to_backtester',
    defaultTimeoutMs: 3000
  },
  'setups.replay.run': {
    id: 'setups.replay.run',
    domain: 'setup',
    owner: 'agent',
    summary: 'Run a replay/backtest for a setup watcher.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'setups_replay_run',
    defaultTimeoutMs: 6000
  },
  'setups.debug.filters.set': {
    id: 'setups.debug.filters.set',
    domain: 'setup',
    owner: 'agent',
    summary: 'Update setup debug replay filters.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'setups_debug_filters_set',
    defaultTimeoutMs: 3000
  },
  'setups.create.form.set': {
    id: 'setups.create.form.set',
    domain: 'setup',
    owner: 'agent',
    summary: 'Update setup watcher create form fields.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'setups_create_form_set',
    defaultTimeoutMs: 3000
  },
  'dashboard.window.set': {
    id: 'dashboard.window.set',
    domain: 'ui',
    owner: 'agent',
    summary: 'Set dashboard session window size.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'dashboard_window_set',
    defaultTimeoutMs: 2000
  },
  'dashboard.smoothing.set': {
    id: 'dashboard.smoothing.set',
    domain: 'ui',
    owner: 'agent',
    summary: 'Toggle dashboard smoothing.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'dashboard_smoothing_set',
    defaultTimeoutMs: 2000
  },
  'dashboard.compare.set': {
    id: 'dashboard.compare.set',
    domain: 'ui',
    owner: 'agent',
    summary: 'Toggle dashboard compare mode.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'dashboard_compare_set',
    defaultTimeoutMs: 2000
  },
  'chart.snapshot': {
    id: 'chart.snapshot',
    domain: 'chart',
    owner: 'agent',
    summary: 'Capture native chart snapshot.',
    requiresVision: true,
    safety: { gates: ['chart_ready'], requiresConfirmation: false },
    auditEventType: 'agent_tool_chart_snapshot',
    defaultTimeoutMs: 4500
  },
  'chart.engine.snapshot': {
    id: 'chart.engine.snapshot',
    domain: 'chart',
    owner: 'agent',
    summary: 'Fetch chart engine session snapshots.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'agent_tool_chart_engine_snapshot',
    defaultTimeoutMs: 4000
  },
  'chart.watch.start': {
    id: 'chart.watch.start',
    domain: 'chart',
    owner: 'agent',
    summary: 'Start chart engine watch for symbol/timeframes.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'chart_watch_start',
    defaultTimeoutMs: 4000
  },
  'chart.watch.stop': {
    id: 'chart.watch.stop',
    domain: 'chart',
    owner: 'agent',
    summary: 'Stop chart engine watch for symbol/timeframes.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'chart_watch_stop',
    defaultTimeoutMs: 4000
  },
  'chart.watch.toggle': {
    id: 'chart.watch.toggle',
    domain: 'chart',
    owner: 'agent',
    summary: 'Toggle chart watch background capture.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'chart_watch_toggle',
    defaultTimeoutMs: 2000
  },
  'chart.watch.mode.set': {
    id: 'chart.watch.mode.set',
    domain: 'chart',
    owner: 'agent',
    summary: 'Set chart watch mode.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'chart_watch_mode_set',
    defaultTimeoutMs: 2000
  },
  'chart.watch.snooze': {
    id: 'chart.watch.snooze',
    domain: 'chart',
    owner: 'agent',
    summary: 'Snooze chart watch.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'chart_watch_snooze',
    defaultTimeoutMs: 2000
  },
  'chart.watch.clear_snooze': {
    id: 'chart.watch.clear_snooze',
    domain: 'chart',
    owner: 'agent',
    summary: 'Clear chart watch snooze.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'chart_watch_clear_snooze',
    defaultTimeoutMs: 2000
  },
  'chart.watch.lead_agent.set': {
    id: 'chart.watch.lead_agent.set',
    domain: 'chart',
    owner: 'agent',
    summary: 'Set lead agent for chart watch.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'chart_watch_lead_set',
    defaultTimeoutMs: 2000
  },
  'chart.session.list': {
    id: 'chart.session.list',
    domain: 'chart',
    owner: 'agent',
    summary: 'List chart sessions.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'chart_session_list',
    defaultTimeoutMs: 4000
  },
  'chart.session.create': {
    id: 'chart.session.create',
    domain: 'chart',
    owner: 'agent',
    summary: 'Create a chart session for a symbol.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'chart_session_create',
    defaultTimeoutMs: 4000
  },
  'chart.session.create_from_tab': {
    id: 'chart.session.create_from_tab',
    domain: 'chart',
    owner: 'agent',
    summary: 'Create a chart session from a browser tab.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'chart_session_create_from_tab',
    defaultTimeoutMs: 4000
  },
  'chart.session.update': {
    id: 'chart.session.update',
    domain: 'chart',
    owner: 'agent',
    summary: 'Update a chart session.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'chart_session_update',
    defaultTimeoutMs: 4000
  },
  'chart.session.remove': {
    id: 'chart.session.remove',
    domain: 'chart',
    owner: 'agent',
    summary: 'Remove a chart session.',
    safety: { gates: ['confirmation'], requiresConfirmation: false },
    auditEventType: 'chart_session_remove',
    defaultTimeoutMs: 4000
  },
  'chart.session.watch.set': {
    id: 'chart.session.watch.set',
    domain: 'chart',
    owner: 'agent',
    summary: 'Enable or disable chart session watch.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'chart_session_watch_set',
    defaultTimeoutMs: 3000
  },
  'chart.session.assign_tab': {
    id: 'chart.session.assign_tab',
    domain: 'chart',
    owner: 'agent',
    summary: 'Assign a browser tab to a chart session timeframe.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'chart_session_assign_tab',
    defaultTimeoutMs: 3000
  },
  'chart.session.clear_timeframe': {
    id: 'chart.session.clear_timeframe',
    domain: 'chart',
    owner: 'agent',
    summary: 'Clear a chart session timeframe assignment.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'chart_session_clear_timeframe',
    defaultTimeoutMs: 3000
  },
  'chart.focus': {
    id: 'chart.focus',
    domain: 'chart',
    owner: 'agent',
    summary: 'Focus native chart on symbol/timeframe.',
    safety: { gates: ['chart_ready'], requiresConfirmation: false },
    auditEventType: 'chart_focus',
    defaultTimeoutMs: 3000
  },
  'chart.symbol.set': {
    id: 'chart.symbol.set',
    domain: 'chart',
    owner: 'agent',
    summary: 'Set native chart symbol.',
    safety: { gates: ['chart_ready'], requiresConfirmation: false },
    auditEventType: 'chart_symbol_set',
    defaultTimeoutMs: 3000
  },
  'chart.timeframe.set': {
    id: 'chart.timeframe.set',
    domain: 'chart',
    owner: 'agent',
    summary: 'Set native chart timeframe.',
    safety: { gates: ['chart_ready'], requiresConfirmation: false },
    auditEventType: 'chart_timeframe_set',
    defaultTimeoutMs: 3000
  },
  'chart.overlay.setups.toggle': {
    id: 'chart.overlay.setups.toggle',
    domain: 'chart',
    owner: 'agent',
    summary: 'Toggle setup overlays on native chart.',
    safety: { gates: ['chart_ready'], requiresConfirmation: false },
    auditEventType: 'chart_overlay_setups_toggle',
    defaultTimeoutMs: 2000
  },
  'chart.overlay.patterns.toggle': {
    id: 'chart.overlay.patterns.toggle',
    domain: 'chart',
    owner: 'agent',
    summary: 'Toggle pattern overlays on native chart.',
    safety: { gates: ['chart_ready'], requiresConfirmation: false },
    auditEventType: 'chart_overlay_patterns_toggle',
    defaultTimeoutMs: 2000
  },
  'chart.overlay.reviews.toggle': {
    id: 'chart.overlay.reviews.toggle',
    domain: 'chart',
    owner: 'agent',
    summary: 'Toggle review overlays on native chart.',
    safety: { gates: ['chart_ready'], requiresConfirmation: false },
    auditEventType: 'chart_overlay_reviews_toggle',
    defaultTimeoutMs: 2000
  },
  'chart.show.indicators.set': {
    id: 'chart.show.indicators.set',
    domain: 'chart',
    owner: 'agent',
    summary: 'Show/hide indicators on native chart.',
    safety: { gates: ['chart_ready'], requiresConfirmation: false },
    auditEventType: 'chart_show_indicators_set',
    defaultTimeoutMs: 2000
  },
  'chart.show.live_quote.set': {
    id: 'chart.show.live_quote.set',
    domain: 'chart',
    owner: 'agent',
    summary: 'Show/hide live quote on native chart.',
    safety: { gates: ['chart_ready'], requiresConfirmation: false },
    auditEventType: 'chart_show_live_quote_set',
    defaultTimeoutMs: 2000
  },
  'chart.show.ranges.set': {
    id: 'chart.show.ranges.set',
    domain: 'chart',
    owner: 'agent',
    summary: 'Show/hide range overlays on native chart.',
    safety: { gates: ['chart_ready'], requiresConfirmation: false },
    auditEventType: 'chart_show_ranges_set',
    defaultTimeoutMs: 2000
  },
  'chart.show.sessions.set': {
    id: 'chart.show.sessions.set',
    domain: 'chart',
    owner: 'agent',
    summary: 'Show/hide session overlays on native chart.',
    safety: { gates: ['chart_ready'], requiresConfirmation: false },
    auditEventType: 'chart_show_sessions_set',
    defaultTimeoutMs: 2000
  },
  'chart.show.constraints.set': {
    id: 'chart.show.constraints.set',
    domain: 'chart',
    owner: 'agent',
    summary: 'Show/hide broker constraints on native chart.',
    safety: { gates: ['chart_ready'], requiresConfirmation: false },
    auditEventType: 'chart_show_constraints_set',
    defaultTimeoutMs: 2000
  },
  'chart.show.positions.set': {
    id: 'chart.show.positions.set',
    domain: 'chart',
    owner: 'agent',
    summary: 'Show/hide positions on native chart.',
    safety: { gates: ['chart_ready'], requiresConfirmation: false },
    auditEventType: 'chart_show_positions_set',
    defaultTimeoutMs: 2000
  },
  'chart.show.orders.set': {
    id: 'chart.show.orders.set',
    domain: 'chart',
    owner: 'agent',
    summary: 'Show/hide orders on native chart.',
    safety: { gates: ['chart_ready'], requiresConfirmation: false },
    auditEventType: 'chart_show_orders_set',
    defaultTimeoutMs: 2000
  },
  'chart.frame.toggle': {
    id: 'chart.frame.toggle',
    domain: 'chart',
    owner: 'agent',
    summary: 'Toggle a chart timeframe on native chart.',
    safety: { gates: ['chart_ready'], requiresConfirmation: false },
    auditEventType: 'chart_frame_toggle',
    defaultTimeoutMs: 2000
  },
  'chart.frames.set': {
    id: 'chart.frames.set',
    domain: 'chart',
    owner: 'agent',
    summary: 'Set active chart timeframes on native chart.',
    safety: { gates: ['chart_ready'], requiresConfirmation: false },
    auditEventType: 'chart_frames_set',
    defaultTimeoutMs: 2000
  },
  'chart.refresh': {
    id: 'chart.refresh',
    domain: 'chart',
    owner: 'agent',
    summary: 'Refresh native chart data.',
    safety: { gates: ['chart_ready'], requiresConfirmation: false },
    auditEventType: 'chart_refresh',
    defaultTimeoutMs: 4000
  },
  'chart.capture_all': {
    id: 'chart.capture_all',
    domain: 'chart',
    owner: 'agent',
    summary: 'Capture multi-frame native chart snapshot.',
    requiresVision: true,
    safety: { gates: ['chart_ready'], requiresConfirmation: false },
    auditEventType: 'chart_capture_all',
    defaultTimeoutMs: 5000
  },
  'chart.capture_snapshot': {
    id: 'chart.capture_snapshot',
    domain: 'chart',
    owner: 'agent',
    summary: 'Capture a native chart snapshot.',
    requiresVision: true,
    safety: { gates: ['chart_ready'], requiresConfirmation: false },
    auditEventType: 'chart_capture_snapshot',
    defaultTimeoutMs: 5000
  },
  'chart.fullscreen.toggle': {
    id: 'chart.fullscreen.toggle',
    domain: 'chart',
    owner: 'agent',
    summary: 'Toggle native chart fullscreen mode.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'chart_fullscreen_toggle',
    defaultTimeoutMs: 2000
  },
  'playbook.list': {
    id: 'playbook.list',
    domain: 'playbook',
    owner: 'agent',
    summary: 'List available task playbooks.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'playbook_list',
    defaultTimeoutMs: 4000
  },
  'playbook.save': {
    id: 'playbook.save',
    domain: 'playbook',
    owner: 'agent',
    summary: 'Create or update a task playbook.',
    safety: { gates: ['permissions'], requiresConfirmation: false },
    auditEventType: 'playbook_save',
    defaultTimeoutMs: 5000
  },
  'playbook.run': {
    id: 'playbook.run',
    domain: 'playbook',
    owner: 'agent',
    summary: 'Run a multi-step task playbook.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'playbook_run',
    defaultTimeoutMs: 8000
  },
  'playbook.run.list': {
    id: 'playbook.run.list',
    domain: 'playbook',
    owner: 'agent',
    summary: 'List playbook runs from the ledger.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'playbook_run_list',
    defaultTimeoutMs: 4000
  },
  'playbook.run.get': {
    id: 'playbook.run.get',
    domain: 'playbook',
    owner: 'agent',
    summary: 'Fetch a single playbook run by id.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'playbook_run_get',
    defaultTimeoutMs: 4000
  },
  'playbook.run.resume': {
    id: 'playbook.run.resume',
    domain: 'playbook',
    owner: 'agent',
    summary: 'Resume or approve a blocked playbook run.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'playbook_run_resume',
    defaultTimeoutMs: 6000
  },
  'backtest.summary': {
    id: 'backtest.summary',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Fetch backtest summary from panel.',
    safety: { gates: ['backtester_ready'], requiresConfirmation: false },
    auditEventType: 'agent_tool_backtest_summary',
    defaultTimeoutMs: 2500
  },
  'backtest.training_pack': {
    id: 'backtest.training_pack',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Fetch backtest training pack.',
    safety: { gates: ['backtester_ready'], requiresConfirmation: false },
    auditEventType: 'agent_tool_backtest_training_pack',
    defaultTimeoutMs: 4500
  },
  'backtest.run': {
    id: 'backtest.run',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Run a single backtest with explicit params.',
    safety: { gates: ['rate_limit'], requiresConfirmation: false },
    auditEventType: 'backtest_run',
    defaultTimeoutMs: 120_000
  },
  'backtest.export': {
    id: 'backtest.export',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Export a backtest run or optimization result.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'backtest_export',
    defaultTimeoutMs: 8000
  },
  'backtest.optimization': {
    id: 'backtest.optimization',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Run headless backtest optimization.',
    safety: { gates: ['backtester_ready', 'rate_limit'], requiresConfirmation: false },
    auditEventType: 'agent_tool_backtest_optimization',
    defaultTimeoutMs: 120_000
  },
  'backtest.optimization.cancel': {
    id: 'backtest.optimization.cancel',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Cancel a running headless backtest optimization.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'backtest_optimization_cancel',
    defaultTimeoutMs: 4000
  },
  'backtest.optimizer.start': {
    id: 'backtest.optimizer.start',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Start multi-objective backtest optimizer.',
    safety: { gates: ['backtester_ready', 'rate_limit'], requiresConfirmation: false },
    auditEventType: 'agent_tool_backtest_optimizer_start',
    defaultTimeoutMs: 120_000
  },
  'backtest.optimizer.status': {
    id: 'backtest.optimizer.status',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Check optimizer status.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'agent_tool_backtest_optimizer_status',
    defaultTimeoutMs: 4000
  },
  'backtest.optimizer.results': {
    id: 'backtest.optimizer.results',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Fetch optimizer results.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'agent_tool_backtest_optimizer_results',
    defaultTimeoutMs: 8000
  },
  'backtest.optimizer.refine': {
    id: 'backtest.optimizer.refine',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Propose optimizer refinement.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'agent_tool_backtest_optimizer_refine',
    defaultTimeoutMs: 6000
  },
  'backtest.optimizer.chain': {
    id: 'backtest.optimizer.chain',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Run chained optimization (round 1 + round 2).',
    safety: { gates: ['backtester_ready', 'rate_limit'], requiresConfirmation: false },
    auditEventType: 'agent_tool_backtest_optimizer_chain',
    defaultTimeoutMs: 180_000
  },
  'backtest.optimizer.winner_params': {
    id: 'backtest.optimizer.winner_params',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Fetch optimizer winner parameters.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'agent_tool_backtest_optimizer_winner_params',
    defaultTimeoutMs: 5000
  },
  'backtest.optimizer.save_preset': {
    id: 'backtest.optimizer.save_preset',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Save optimizer winner to setup library.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'agent_tool_backtest_optimizer_save_preset',
    defaultTimeoutMs: 5000
  },
  'backtest.apply_optimization': {
    id: 'backtest.apply_optimization',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Apply optimized parameters to the backtester panel.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'backtest_apply_optimization',
    defaultTimeoutMs: 6000
  },
  'backtester.execution.set': {
    id: 'backtester.execution.set',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Update Backtester execution config.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'backtester_execution_set',
    defaultTimeoutMs: 3000
  },
  'backtester.confluence.set': {
    id: 'backtester.confluence.set',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Update Backtester confluence config.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'backtester_confluence_set',
    defaultTimeoutMs: 3000
  },
  'backtester.validation.set': {
    id: 'backtester.validation.set',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Update Backtester validation config.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'backtester_validation_set',
    defaultTimeoutMs: 3000
  },
  'backtester.walkforward.set': {
    id: 'backtester.walkforward.set',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Update Backtester walk-forward config.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'backtester_walkforward_set',
    defaultTimeoutMs: 3000
  },
  'backtester.replay.set': {
    id: 'backtester.replay.set',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Update Backtester replay controls.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'backtester_replay_set',
    defaultTimeoutMs: 3000
  },
  'backtester.replay.play.set': {
    id: 'backtester.replay.play.set',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Toggle Backtester replay playback.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'backtester_replay_play_set',
    defaultTimeoutMs: 2000
  },
  'backtester.replay.step': {
    id: 'backtester.replay.step',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Step Backtester replay forward/backward.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'backtester_replay_step',
    defaultTimeoutMs: 2000
  },
  'backtester.tiebreaker.set': {
    id: 'backtester.tiebreaker.set',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Update Backtester tie-breaker preference.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'backtester_tiebreaker_set',
    defaultTimeoutMs: 2000
  },
  'backtester.auto_summary.set': {
    id: 'backtester.auto_summary.set',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Update Backtester auto-summary settings.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'backtester_auto_summary_set',
    defaultTimeoutMs: 2000
  },
  'backtester.watchlist.mode.set': {
    id: 'backtester.watchlist.mode.set',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Set Backtester watchlist mode (suggest/paper/live).',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'backtester_watchlist_mode_set',
    defaultTimeoutMs: 2000
  },
  'backtester.trade.select': {
    id: 'backtester.trade.select',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Select a trade in Backtester results.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'backtester_trade_select',
    defaultTimeoutMs: 2000
  },
  'backtester.memory.filters.set': {
    id: 'backtester.memory.filters.set',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Update Backtester agent memory filters.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'backtester_memory_filters_set',
    defaultTimeoutMs: 3000
  },
  'backtester.research.config.set': {
    id: 'backtester.research.config.set',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Update Backtester research autopilot config.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'backtester_research_config_set',
    defaultTimeoutMs: 3000
  },
  'backtest.preset.list': {
    id: 'backtest.preset.list',
    domain: 'backtest',
    owner: 'agent',
    summary: 'List backtester optimizer presets.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'backtest_preset_list',
    defaultTimeoutMs: 4000
  },
  'backtest.preset.save': {
    id: 'backtest.preset.save',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Save or update a backtester optimizer preset.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'backtest_preset_save',
    defaultTimeoutMs: 6000
  },
  'backtest.preset.load': {
    id: 'backtest.preset.load',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Load a backtester optimizer preset.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'backtest_preset_load',
    defaultTimeoutMs: 6000
  },
  'backtest.preset.delete': {
    id: 'backtest.preset.delete',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Delete a backtester optimizer preset.',
    safety: { gates: ['confirmation'], requiresConfirmation: false },
    auditEventType: 'backtest_preset_delete',
    defaultTimeoutMs: 6000
  },
  'backtest.preset.export': {
    id: 'backtest.preset.export',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Export backtester optimizer presets.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'backtest_preset_export',
    defaultTimeoutMs: 8000
  },
  'backtest.preset.import': {
    id: 'backtest.preset.import',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Import backtester optimizer presets from JSON.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'backtest_preset_import',
    defaultTimeoutMs: 8000
  },
  'backtest.batch.preset.list': {
    id: 'backtest.batch.preset.list',
    domain: 'backtest',
    owner: 'agent',
    summary: 'List backtester batch presets.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'backtest_batch_preset_list',
    defaultTimeoutMs: 4000
  },
  'backtest.batch.preset.save': {
    id: 'backtest.batch.preset.save',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Save or update a backtester batch preset.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'backtest_batch_preset_save',
    defaultTimeoutMs: 6000
  },
  'backtest.batch.preset.load': {
    id: 'backtest.batch.preset.load',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Load a backtester batch preset.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'backtest_batch_preset_load',
    defaultTimeoutMs: 6000
  },
  'backtest.batch.preset.delete': {
    id: 'backtest.batch.preset.delete',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Delete a backtester batch preset.',
    safety: { gates: ['confirmation'], requiresConfirmation: false },
    auditEventType: 'backtest_batch_preset_delete',
    defaultTimeoutMs: 6000
  },
  'backtest.batch.run': {
    id: 'backtest.batch.run',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Run backtester batch optimization.',
    safety: { gates: ['backtester_ready', 'rate_limit'], requiresConfirmation: false },
    auditEventType: 'backtest_batch_run',
    defaultTimeoutMs: 120_000
  },
  'backtest.batch.cancel': {
    id: 'backtest.batch.cancel',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Cancel a running backtester batch optimization.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'backtest_batch_cancel',
    defaultTimeoutMs: 6000
  },
  'backtest.batch.clear': {
    id: 'backtest.batch.clear',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Clear backtester batch results.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'backtest_batch_clear',
    defaultTimeoutMs: 4000
  },
  'backtest.batch.export': {
    id: 'backtest.batch.export',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Export backtester batch results.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'backtest_batch_export',
    defaultTimeoutMs: 8000
  },
  'research.autopilot.start': {
    id: 'research.autopilot.start',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Start research autopilot session.',
    safety: { gates: ['backtester_ready', 'rate_limit'], requiresConfirmation: false },
    auditEventType: 'agent_tool_research_autopilot_start',
    defaultTimeoutMs: 6000
  },
  'research.autopilot.status': {
    id: 'research.autopilot.status',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Check research autopilot status.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'agent_tool_research_autopilot_status',
    defaultTimeoutMs: 4000
  },
  'research.autopilot.results': {
    id: 'research.autopilot.results',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Fetch research autopilot results.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'agent_tool_research_autopilot_results',
    defaultTimeoutMs: 8000
  },
  'research.autopilot.stop': {
    id: 'research.autopilot.stop',
    domain: 'backtest',
    owner: 'agent',
    summary: 'Stop research autopilot session.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'agent_tool_research_autopilot_stop',
    defaultTimeoutMs: 4000
  },
  'broker.refresh_snapshot': {
    id: 'broker.refresh_snapshot',
    domain: 'broker',
    owner: 'agent',
    summary: 'Refresh broker snapshot.',
    requiresBroker: true,
    safety: { gates: ['broker_connected', 'rate_limit'], requiresConfirmation: false },
    auditEventType: 'broker_refresh_snapshot',
    defaultTimeoutMs: 8000
  },
  'broker.close_position': {
    id: 'broker.close_position',
    domain: 'broker',
    owner: 'agent',
    summary: 'Close an open broker position.',
    requiresBroker: true,
    safety: { gates: ['broker_connected', 'broker_trading_enabled', 'confirmation', 'permissions'] },
    auditEventType: 'broker_close_position',
    defaultTimeoutMs: 8000
  },
  'broker.cancel_order': {
    id: 'broker.cancel_order',
    domain: 'broker',
    owner: 'agent',
    summary: 'Cancel an open broker order.',
    requiresBroker: true,
    safety: { gates: ['broker_connected', 'broker_trading_enabled', 'confirmation', 'permissions'] },
    auditEventType: 'broker_cancel_order',
    defaultTimeoutMs: 8000
  },
  'broker.modify_position': {
    id: 'broker.modify_position',
    domain: 'broker',
    owner: 'agent',
    summary: 'Modify an open position SL/TP.',
    requiresBroker: true,
    safety: { gates: ['broker_connected', 'broker_trading_enabled', 'confirmation', 'permissions'] },
    auditEventType: 'broker_modify_position',
    defaultTimeoutMs: 8000
  },
  'broker.modify_order': {
    id: 'broker.modify_order',
    domain: 'broker',
    owner: 'agent',
    summary: 'Modify an open order price/qty/SL/TP.',
    requiresBroker: true,
    safety: { gates: ['broker_connected', 'broker_trading_enabled', 'confirmation', 'permissions'] },
    auditEventType: 'broker_modify_order',
    defaultTimeoutMs: 8000
  },
  'broker.quote': {
    id: 'broker.quote',
    domain: 'broker',
    owner: 'agent',
    summary: 'Fetch broker quote.',
    requiresBroker: true,
    safety: { gates: ['broker_connected', 'rate_limit'], requiresConfirmation: false },
    auditEventType: 'broker_get_quote',
    defaultTimeoutMs: 4000
  },
  'watcher.list': {
    id: 'watcher.list',
    domain: 'watcher',
    owner: 'agent',
    summary: 'List setup watchers.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'watcher_list',
    defaultTimeoutMs: 3000
  },
  'watcher.create': {
    id: 'watcher.create',
    domain: 'watcher',
    owner: 'agent',
    summary: 'Create a setup watcher.',
    safety: { gates: ['permissions'], requiresConfirmation: false },
    auditEventType: 'watcher_create',
    defaultTimeoutMs: 5000
  },
  'watcher.update': {
    id: 'watcher.update',
    domain: 'watcher',
    owner: 'agent',
    summary: 'Update a setup watcher.',
    safety: { gates: ['permissions', 'watcher_exists'], requiresConfirmation: false },
    auditEventType: 'watcher_update',
    defaultTimeoutMs: 5000
  },
  'watcher.delete': {
    id: 'watcher.delete',
    domain: 'watcher',
    owner: 'agent',
    summary: 'Delete a setup watcher.',
    safety: { gates: ['confirmation', 'permissions', 'watcher_exists'] },
    auditEventType: 'watcher_delete',
    defaultTimeoutMs: 5000
  },
  'watcher.signals': {
    id: 'watcher.signals',
    domain: 'watcher',
    owner: 'agent',
    summary: 'Fetch setup signals.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'watcher_signals',
    defaultTimeoutMs: 4000
  },
  'watcher.signal.explain': {
    id: 'watcher.signal.explain',
    domain: 'watcher',
    owner: 'agent',
    summary: 'Explain setup signal.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'watcher_signal_explain',
    defaultTimeoutMs: 6000
  },
  'watcher.bulk.enable': {
    id: 'watcher.bulk.enable',
    domain: 'watcher',
    owner: 'agent',
    summary: 'Enable multiple setup watchers.',
    safety: { gates: ['permissions'], requiresConfirmation: false },
    auditEventType: 'watcher_bulk_enable',
    defaultTimeoutMs: 5000
  },
  'watcher.bulk.disable': {
    id: 'watcher.bulk.disable',
    domain: 'watcher',
    owner: 'agent',
    summary: 'Disable multiple setup watchers.',
    safety: { gates: ['permissions'], requiresConfirmation: false },
    auditEventType: 'watcher_bulk_disable',
    defaultTimeoutMs: 5000
  },
  'watcher.bulk.mode': {
    id: 'watcher.bulk.mode',
    domain: 'watcher',
    owner: 'agent',
    summary: 'Set mode for multiple setup watchers.',
    safety: { gates: ['permissions'], requiresConfirmation: false },
    auditEventType: 'watcher_bulk_mode',
    defaultTimeoutMs: 5000
  },
  'setup.library.list': {
    id: 'setup.library.list',
    domain: 'setup',
    owner: 'agent',
    summary: 'List setup library entries.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'setup_library_list',
    defaultTimeoutMs: 4000
  },
  'setup.library.create_watcher': {
    id: 'setup.library.create_watcher',
    domain: 'setup',
    owner: 'agent',
    summary: 'Create watcher from setup library.',
    safety: { gates: ['permissions'], requiresConfirmation: false },
    auditEventType: 'setup_library_create_watcher',
    defaultTimeoutMs: 6000
  },
  'setup.library.save': {
    id: 'setup.library.save',
    domain: 'setup',
    owner: 'agent',
    summary: 'Save a setup library entry from explicit params.',
    safety: { gates: ['permissions'], requiresConfirmation: false },
    auditEventType: 'setup_library_save',
    defaultTimeoutMs: 6000
  },
  'setup.library.update': {
    id: 'setup.library.update',
    domain: 'setup',
    owner: 'agent',
    summary: 'Update a setup library entry from explicit params.',
    safety: { gates: ['permissions'], requiresConfirmation: false },
    auditEventType: 'setup_library_update',
    defaultTimeoutMs: 6000
  },
  'setup.library.delete': {
    id: 'setup.library.delete',
    domain: 'setup',
    owner: 'agent',
    summary: 'Delete a setup library entry.',
    safety: { gates: ['confirmation', 'permissions'] },
    auditEventType: 'setup_library_delete',
    defaultTimeoutMs: 5000
  },
  'setup.library.export': {
    id: 'setup.library.export',
    domain: 'setup',
    owner: 'agent',
    summary: 'Export setup library entries.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'setup_library_export',
    defaultTimeoutMs: 8000
  },
  'setup.library.import': {
    id: 'setup.library.import',
    domain: 'setup',
    owner: 'agent',
    summary: 'Import setup library entries from JSON.',
    safety: { gates: ['permissions'], requiresConfirmation: false },
    auditEventType: 'setup_library_import',
    defaultTimeoutMs: 8000
  },
  'setups.filters.set': {
    id: 'setups.filters.set',
    domain: 'setup',
    owner: 'agent',
    summary: 'Set Setups panel filters.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'setups_filters_set',
    defaultTimeoutMs: 3000
  },
  'setups.signals.clear': {
    id: 'setups.signals.clear',
    domain: 'setup',
    owner: 'agent',
    summary: 'Clear setup signals list.',
    safety: { gates: ['confirmation'] },
    auditEventType: 'setups_signals_clear',
    defaultTimeoutMs: 4000
  },
  'setups.replay.range.set': {
    id: 'setups.replay.range.set',
    domain: 'setup',
    owner: 'agent',
    summary: 'Set setup replay range days.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'setups_replay_range_set',
    defaultTimeoutMs: 3000
  },
  'agent.memory.get': {
    id: 'agent.memory.get',
    domain: 'agent',
    owner: 'agent',
    summary: 'Fetch a stored agent memory record.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'agent_memory_get',
    defaultTimeoutMs: 4000
  },
  'agent.memory.clear': {
    id: 'agent.memory.clear',
    domain: 'agent',
    owner: 'agent',
    summary: 'Clear all agent memory records.',
    safety: { gates: ['confirmation', 'permissions'], requiresConfirmation: false },
    auditEventType: 'agent_memory_clear',
    defaultTimeoutMs: 6000
  },
  'agent.memory.filters.set': {
    id: 'agent.memory.filters.set',
    domain: 'agent',
    owner: 'agent',
    summary: 'Update Agent Memory panel filters.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'agent_memory_filters_set',
    defaultTimeoutMs: 3000
  },
  'agent.memory.list': {
    id: 'agent.memory.list',
    domain: 'agent',
    owner: 'agent',
    summary: 'List agent memory records.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'agent_memory_list',
    defaultTimeoutMs: 4000
  },
  'agent.memory.export': {
    id: 'agent.memory.export',
    domain: 'agent',
    owner: 'agent',
    summary: 'Export agent memory records.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'agent_memory_export',
    defaultTimeoutMs: 8000
  },
  'agent_test.scenario.create': {
    id: 'agent_test.scenario.create',
    domain: 'agent_test',
    owner: 'agent',
    summary: 'Create or update an agent test scenario.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'agent_test_scenario_create',
    defaultTimeoutMs: 4000
  },
  'agent_test.scenario.list': {
    id: 'agent_test.scenario.list',
    domain: 'agent_test',
    owner: 'agent',
    summary: 'List agent test scenarios.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'agent_test_scenario_list',
    defaultTimeoutMs: 4000
  },
  'agent_test.scenario.get': {
    id: 'agent_test.scenario.get',
    domain: 'agent_test',
    owner: 'agent',
    summary: 'Fetch a single agent test scenario.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'agent_test_scenario_get',
    defaultTimeoutMs: 4000
  },
  'agent_test.run': {
    id: 'agent_test.run',
    domain: 'agent_test',
    owner: 'agent',
    summary: 'Run an agent test scenario using a playbook.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'agent_test_run',
    defaultTimeoutMs: 6000
  },
  'agent_test.run.list': {
    id: 'agent_test.run.list',
    domain: 'agent_test',
    owner: 'agent',
    summary: 'List agent test runs.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'agent_test_run_list',
    defaultTimeoutMs: 4000
  },
  'agent_test.run.get': {
    id: 'agent_test.run.get',
    domain: 'agent_test',
    owner: 'agent',
    summary: 'Fetch a single agent test run.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'agent_test_run_get',
    defaultTimeoutMs: 4000
  },
  'agent.capabilities.update': {
    id: 'agent.capabilities.update',
    domain: 'agent',
    owner: 'system',
    summary: 'Update agent capability flags.',
    safety: { gates: ['permissions'], requiresConfirmation: false },
    auditEventType: 'agent_capabilities_update',
    defaultTimeoutMs: 4000
  },
  'agent.add': {
    id: 'agent.add',
    domain: 'agent',
    owner: 'agent',
    summary: 'Add a new chat agent.',
    safety: { gates: ['permissions'], requiresConfirmation: false },
    auditEventType: 'agent_add',
    defaultTimeoutMs: 4000
  },
  'agent.update': {
    id: 'agent.update',
    domain: 'agent',
    owner: 'agent',
    summary: 'Update a chat agent profile.',
    safety: { gates: ['permissions'], requiresConfirmation: false },
    auditEventType: 'agent_update',
    defaultTimeoutMs: 4000
  },
  'agent.delete': {
    id: 'agent.delete',
    domain: 'agent',
    owner: 'agent',
    summary: 'Delete a chat agent profile.',
    safety: { gates: ['permissions', 'confirmation'], requiresConfirmation: false },
    auditEventType: 'agent_delete',
    defaultTimeoutMs: 4000
  },
  'agent.switch': {
    id: 'agent.switch',
    domain: 'agent',
    owner: 'agent',
    summary: 'Switch active chat agent.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'agent_switch',
    defaultTimeoutMs: 3000
  },
  'autopilot.update_settings': {
    id: 'autopilot.update_settings',
    domain: 'autopilot',
    owner: 'agent',
    summary: 'Update AutoPilot risk settings.',
    safety: { gates: ['permissions'], requiresConfirmation: false },
    auditEventType: 'autopilot_update_settings',
    defaultTimeoutMs: 4000
  },
  'autopilot.enable': {
    id: 'autopilot.enable',
    domain: 'autopilot',
    owner: 'agent',
    summary: 'Enable AutoPilot.',
    safety: { gates: ['permissions'], requiresConfirmation: false },
    auditEventType: 'autopilot_enable',
    defaultTimeoutMs: 2000
  },
  'autopilot.disable': {
    id: 'autopilot.disable',
    domain: 'autopilot',
    owner: 'agent',
    summary: 'Disable AutoPilot.',
    safety: { gates: ['permissions'], requiresConfirmation: false },
    auditEventType: 'autopilot_disable',
    defaultTimeoutMs: 2000
  },
  'autopilot.mode.set': {
    id: 'autopilot.mode.set',
    domain: 'autopilot',
    owner: 'agent',
    summary: 'Set AutoPilot mode.',
    safety: { gates: ['permissions'], requiresConfirmation: false },
    auditEventType: 'autopilot_mode_set',
    defaultTimeoutMs: 2000
  },
  'autopilot.execution_mode.set': {
    id: 'autopilot.execution_mode.set',
    domain: 'autopilot',
    owner: 'agent',
    summary: 'Set AutoPilot execution mode (live/paper/shadow).',
    safety: { gates: ['permissions'], requiresConfirmation: false },
    auditEventType: 'autopilot_execution_mode_set',
    defaultTimeoutMs: 2000
  },
  'autopilot.confirmation.set': {
    id: 'autopilot.confirmation.set',
    domain: 'autopilot',
    owner: 'agent',
    summary: 'Toggle AutoPilot confirmation requirement.',
    safety: { gates: ['permissions'], requiresConfirmation: false },
    auditEventType: 'autopilot_confirmation_set',
    defaultTimeoutMs: 2000
  },
  'autopilot.killswitch.set': {
    id: 'autopilot.killswitch.set',
    domain: 'autopilot',
    owner: 'agent',
    summary: 'Toggle AutoPilot kill switch.',
    safety: { gates: ['permissions'], requiresConfirmation: false },
    auditEventType: 'autopilot_killswitch_set',
    defaultTimeoutMs: 2000
  },
  'autopilot.memory.filters.set': {
    id: 'autopilot.memory.filters.set',
    domain: 'autopilot',
    owner: 'agent',
    summary: 'Update AutoPilot memory manager filters.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'autopilot_memory_filters_set',
    defaultTimeoutMs: 3000
  },
  'autopilot.memory.draft.set': {
    id: 'autopilot.memory.draft.set',
    domain: 'autopilot',
    owner: 'agent',
    summary: 'Update AutoPilot memory draft state.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'autopilot_memory_draft_set',
    defaultTimeoutMs: 3000
  },
  'autopilot.flow.filters.set': {
    id: 'autopilot.flow.filters.set',
    domain: 'autopilot',
    owner: 'agent',
    summary: 'Update AutoPilot recommended flow filters.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'autopilot_flow_filters_set',
    defaultTimeoutMs: 3000
  },
  'autopilot.run.select': {
    id: 'autopilot.run.select',
    domain: 'autopilot',
    owner: 'agent',
    summary: 'Select a Task Tree run in AutoPilot.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'autopilot_run_select',
    defaultTimeoutMs: 3000
  },
  'autopilot.truth.run.set': {
    id: 'autopilot.truth.run.set',
    domain: 'autopilot',
    owner: 'agent',
    summary: 'Set AutoPilot truth replay run.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'autopilot_truth_run_set',
    defaultTimeoutMs: 3000
  },
  'autopilot.telegram.inputs.set': {
    id: 'autopilot.telegram.inputs.set',
    domain: 'autopilot',
    owner: 'agent',
    summary: 'Update AutoPilot Telegram input fields.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'autopilot_telegram_inputs_set',
    defaultTimeoutMs: 3000
  },
  'shadow.stats.get': {
    id: 'shadow.stats.get',
    domain: 'autopilot',
    owner: 'agent',
    summary: 'Fetch shadow mode trade stats and compare summary.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'shadow_stats_get',
    defaultTimeoutMs: 4000
  },
  'shadow.trades.list': {
    id: 'shadow.trades.list',
    domain: 'autopilot',
    owner: 'agent',
    summary: 'List shadow mode trades from the ledger.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'shadow_trades_list',
    defaultTimeoutMs: 4000
  },
  'shadow.compare': {
    id: 'shadow.compare',
    domain: 'autopilot',
    owner: 'agent',
    summary: 'Compare shadow trades to live/paper outcomes.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'shadow_compare',
    defaultTimeoutMs: 5000
  },
  'tradelocker.search_instruments': {
    id: 'tradelocker.search_instruments',
    domain: 'broker',
    owner: 'agent',
    summary: 'Search TradeLocker instruments.',
    requiresBroker: true,
    safety: { gates: ['broker_connected'], requiresConfirmation: false },
    auditEventType: 'tradelocker_search_instruments',
    defaultTimeoutMs: 5000
  },
  'tradelocker.positions.list': {
    id: 'tradelocker.positions.list',
    domain: 'broker',
    owner: 'agent',
    summary: 'List TradeLocker open positions (from snapshot).',
    requiresBroker: true,
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'tradelocker_positions_list',
    defaultTimeoutMs: 4000
  },
  'tradelocker.orders.list': {
    id: 'tradelocker.orders.list',
    domain: 'broker',
    owner: 'agent',
    summary: 'List TradeLocker open orders (from snapshot).',
    requiresBroker: true,
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'tradelocker_orders_list',
    defaultTimeoutMs: 4000
  },
  'tradelocker.history.list': {
    id: 'tradelocker.history.list',
    domain: 'broker',
    owner: 'agent',
    summary: 'List TradeLocker trade history from ledger.',
    requiresBroker: true,
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'tradelocker_history_list',
    defaultTimeoutMs: 6000
  },
  'tradelocker.cancel_all_orders': {
    id: 'tradelocker.cancel_all_orders',
    domain: 'broker',
    owner: 'agent',
    summary: 'Cancel all open TradeLocker orders.',
    requiresBroker: true,
    safety: { gates: ['broker_connected', 'broker_trading_enabled', 'confirmation', 'permissions'] },
    auditEventType: 'tradelocker_cancel_all_orders',
    defaultTimeoutMs: 120_000
  },
  'tradelocker.close_all_positions': {
    id: 'tradelocker.close_all_positions',
    domain: 'broker',
    owner: 'agent',
    summary: 'Close all open TradeLocker positions.',
    requiresBroker: true,
    safety: { gates: ['broker_connected', 'broker_trading_enabled', 'confirmation', 'permissions'] },
    auditEventType: 'tradelocker_close_all_positions',
    defaultTimeoutMs: 120_000
  },
  'tradelocker.place_order': {
    id: 'tradelocker.place_order',
    domain: 'broker',
    owner: 'agent',
    summary: 'Place a TradeLocker order (ticket).',
    requiresBroker: true,
    safety: { gates: ['broker_connected', 'broker_trading_enabled', 'confirmation', 'permissions', 'rate_limit'] },
    auditEventType: 'tradelocker_place_order',
    defaultTimeoutMs: 12_000
  },
  'tradelocker.set_active_account': {
    id: 'tradelocker.set_active_account',
    domain: 'broker',
    owner: 'agent',
    summary: 'Set active TradeLocker account.',
    requiresBroker: true,
    safety: { gates: ['permissions'], requiresConfirmation: false },
    auditEventType: 'tradelocker_set_active_account',
    defaultTimeoutMs: 6000
  },
  'tradelocker.connect': {
    id: 'tradelocker.connect',
    domain: 'broker',
    owner: 'agent',
    summary: 'Connect to TradeLocker.',
    requiresBroker: true,
    safety: { gates: ['permissions'], requiresConfirmation: false },
    auditEventType: 'tradelocker_connect',
    defaultTimeoutMs: 12_000
  },
  'tradelocker.config.update': {
    id: 'tradelocker.config.update',
    domain: 'broker',
    owner: 'agent',
    summary: 'Update TradeLocker saved configuration (non-secret).',
    requiresBroker: true,
    safety: { gates: ['permissions'], requiresConfirmation: false },
    auditEventType: 'tradelocker_config_update',
    defaultTimeoutMs: 6000
  },
  'tradelocker.trading_options.set': {
    id: 'tradelocker.trading_options.set',
    domain: 'broker',
    owner: 'agent',
    summary: 'Update TradeLocker trading options.',
    requiresBroker: true,
    safety: { gates: ['permissions'], requiresConfirmation: false },
    auditEventType: 'tradelocker_trading_options_set',
    defaultTimeoutMs: 6000
  },
  'tradelocker.stream.start': {
    id: 'tradelocker.stream.start',
    domain: 'broker',
    owner: 'agent',
    summary: 'Start TradeLocker streaming.',
    requiresBroker: true,
    safety: { gates: ['permissions'], requiresConfirmation: false },
    auditEventType: 'tradelocker_stream_start',
    defaultTimeoutMs: 8000
  },
  'tradelocker.stream.stop': {
    id: 'tradelocker.stream.stop',
    domain: 'broker',
    owner: 'agent',
    summary: 'Stop TradeLocker streaming.',
    requiresBroker: true,
    safety: { gates: ['permissions'], requiresConfirmation: false },
    auditEventType: 'tradelocker_stream_stop',
    defaultTimeoutMs: 8000
  },
  'tradelocker.disconnect': {
    id: 'tradelocker.disconnect',
    domain: 'broker',
    owner: 'agent',
    summary: 'Disconnect from TradeLocker.',
    requiresBroker: true,
    safety: { gates: ['permissions'], requiresConfirmation: false },
    auditEventType: 'tradelocker_disconnect',
    defaultTimeoutMs: 8000
  },
  'tradelocker.refresh_accounts': {
    id: 'tradelocker.refresh_accounts',
    domain: 'broker',
    owner: 'agent',
    summary: 'Refresh TradeLocker account list.',
    requiresBroker: true,
    safety: { gates: ['permissions'], requiresConfirmation: false },
    auditEventType: 'tradelocker_refresh_accounts',
    defaultTimeoutMs: 8000
  },
  'tradelocker.reconcile_account_state': {
    id: 'tradelocker.reconcile_account_state',
    domain: 'broker',
    owner: 'agent',
    summary: 'Reconcile TradeLocker account state from broker routes.',
    requiresBroker: true,
    safety: { gates: ['permissions'], requiresConfirmation: false },
    auditEventType: 'tradelocker_reconcile_account_state',
    defaultTimeoutMs: 30_000
  },
  'tradelocker.clear_secrets': {
    id: 'tradelocker.clear_secrets',
    domain: 'broker',
    owner: 'agent',
    summary: 'Clear saved TradeLocker secrets.',
    requiresBroker: true,
    safety: { gates: ['permissions', 'confirmation'], requiresConfirmation: false },
    auditEventType: 'tradelocker_clear_secrets',
    defaultTimeoutMs: 8000
  },
  'agent.memory.add': {
    id: 'agent.memory.add',
    domain: 'agent',
    owner: 'agent',
    summary: 'Add a manual trade memory.',
    safety: { gates: ['permissions'], requiresConfirmation: false },
    auditEventType: 'agent_memory_add',
    defaultTimeoutMs: 4000
  },
  'agent.memory.update': {
    id: 'agent.memory.update',
    domain: 'agent',
    owner: 'agent',
    summary: 'Update a trade memory entry.',
    safety: { gates: ['permissions'], requiresConfirmation: false },
    auditEventType: 'agent_memory_update',
    defaultTimeoutMs: 4000
  },
  'agent.memory.delete': {
    id: 'agent.memory.delete',
    domain: 'agent',
    owner: 'agent',
    summary: 'Delete a trade memory entry.',
    safety: { gates: ['permissions'], requiresConfirmation: false },
    auditEventType: 'agent_memory_delete',
    defaultTimeoutMs: 4000
  },
  'notes.append': {
    id: 'notes.append',
    domain: 'notes',
    owner: 'agent',
    summary: 'Append a note entry to Notes.',
    safety: { gates: ['permissions'], requiresConfirmation: false },
    auditEventType: 'notes_append',
    defaultTimeoutMs: 4000
  },
  'notes.entry.open': {
    id: 'notes.entry.open',
    domain: 'notes',
    owner: 'agent',
    summary: 'Open a specific note entry by id.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'notes_entry_open',
    defaultTimeoutMs: 2000
  },
  'notes.checklist.toggle': {
    id: 'notes.checklist.toggle',
    domain: 'notes',
    owner: 'agent',
    summary: 'Toggle a checklist item on the active note.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'notes_checklist_toggle',
    defaultTimeoutMs: 2000
  },
  'notes.mistake.toggle': {
    id: 'notes.mistake.toggle',
    domain: 'notes',
    owner: 'agent',
    summary: 'Toggle a mistake tag on the active note.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'notes_mistake_toggle',
    defaultTimeoutMs: 2000
  },
  'notes.trade_link.add': {
    id: 'notes.trade_link.add',
    domain: 'notes',
    owner: 'agent',
    summary: 'Link a ledger trade to the active note.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'notes_trade_link_add',
    defaultTimeoutMs: 4000
  },
  'notes.trade_link.remove': {
    id: 'notes.trade_link.remove',
    domain: 'notes',
    owner: 'agent',
    summary: 'Remove a linked ledger trade from the active note.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'notes_trade_link_remove',
    defaultTimeoutMs: 4000
  },
  'notes.trade.replay': {
    id: 'notes.trade.replay',
    domain: 'notes',
    owner: 'agent',
    summary: 'Replay a linked trade from Notes in Native Chart.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'notes_trade_replay',
    defaultTimeoutMs: 3000
  },
  'notes.context.attach': {
    id: 'notes.context.attach',
    domain: 'notes',
    owner: 'agent',
    summary: 'Attach context pack to the active note.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'notes_context_attach',
    defaultTimeoutMs: 8000
  },
  'notes.context.clear': {
    id: 'notes.context.clear',
    domain: 'notes',
    owner: 'agent',
    summary: 'Clear attached context from the active note.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'notes_context_clear',
    defaultTimeoutMs: 2000
  },
  'notes.export': {
    id: 'notes.export',
    domain: 'notes',
    owner: 'agent',
    summary: 'Export notes to CSV or Markdown.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'notes_export',
    defaultTimeoutMs: 8000
  },
  'notes.list': {
    id: 'notes.list',
    domain: 'notes',
    owner: 'agent',
    summary: 'List notes entries.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'notes_list',
    defaultTimeoutMs: 4000
  },
  'notes.filters.set': {
    id: 'notes.filters.set',
    domain: 'notes',
    owner: 'agent',
    summary: 'Set Notes panel filters.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'notes_filters_set',
    defaultTimeoutMs: 3000
  },
  'notes.auto_link.set': {
    id: 'notes.auto_link.set',
    domain: 'notes',
    owner: 'agent',
    summary: 'Toggle auto-link for new notes.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'notes_auto_link_set',
    defaultTimeoutMs: 2000
  },
  'notes.auto_recap.set': {
    id: 'notes.auto_recap.set',
    domain: 'notes',
    owner: 'agent',
    summary: 'Toggle weekly recap auto-generation.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'notes_auto_recap_set',
    defaultTimeoutMs: 2000
  },
  'notes.summary.set': {
    id: 'notes.summary.set',
    domain: 'notes',
    owner: 'agent',
    summary: 'Toggle notes summary panel.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'notes_summary_set',
    defaultTimeoutMs: 2000
  },
  'notes.calendar.set_month': {
    id: 'notes.calendar.set_month',
    domain: 'notes',
    owner: 'agent',
    summary: 'Set Notes calendar month.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'notes_calendar_set_month',
    defaultTimeoutMs: 2000
  },
  'notes.update': {
    id: 'notes.update',
    domain: 'notes',
    owner: 'agent',
    summary: 'Update a notes entry.',
    safety: { gates: ['permissions'], requiresConfirmation: false },
    auditEventType: 'notes_update',
    defaultTimeoutMs: 4000
  },
  'notes.delete': {
    id: 'notes.delete',
    domain: 'notes',
    owner: 'agent',
    summary: 'Delete a notes entry.',
    safety: { gates: ['confirmation', 'permissions'], requiresConfirmation: false },
    auditEventType: 'notes_delete',
    defaultTimeoutMs: 4000
  },
  'audit.list': {
    id: 'audit.list',
    domain: 'ledger',
    owner: 'agent',
    summary: 'List audit events from the ledger.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'audit_list',
    defaultTimeoutMs: 4000
  },
  'audit.filters.set': {
    id: 'audit.filters.set',
    domain: 'ledger',
    owner: 'agent',
    summary: 'Update audit trail panel filters.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'audit_filters_set',
    defaultTimeoutMs: 3000
  },
  'audit.export': {
    id: 'audit.export',
    domain: 'ledger',
    owner: 'agent',
    summary: 'Export audit events.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'audit_export',
    defaultTimeoutMs: 8000
  },
  'diagnostics.export': {
    id: 'diagnostics.export',
    domain: 'ops',
    owner: 'agent',
    summary: 'Export a diagnostics bundle (system snapshot, audit log, errors).',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'diagnostics_export',
    defaultTimeoutMs: 8000
  },
  'truth.replay': {
    id: 'truth.replay',
    domain: 'ledger',
    owner: 'agent',
    summary: 'Replay truth events for a run or symbol.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'truth_replay',
    defaultTimeoutMs: 4000
  },
  'task_tree.replay': {
    id: 'task_tree.replay',
    domain: 'ledger',
    owner: 'agent',
    summary: 'Replay a task tree run by id.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'task_tree_replay',
    defaultTimeoutMs: 4000
  },
  'task_tree.resume': {
    id: 'task_tree.resume',
    domain: 'task_tree',
    owner: 'agent',
    summary: 'Resume a blocked task tree run after restart.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'task_tree_resume',
    defaultTimeoutMs: 6000
  },
  'task_tree.abort': {
    id: 'task_tree.abort',
    domain: 'task_tree',
    owner: 'agent',
    summary: 'Abort a pending task tree run.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'task_tree_abort',
    defaultTimeoutMs: 4000
  },
  'changes.list': {
    id: 'changes.list',
    domain: 'ledger',
    owner: 'agent',
    summary: 'List change events (audit trail).',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'changes_list',
    defaultTimeoutMs: 4000
  },
  'changes.export': {
    id: 'changes.export',
    domain: 'ledger',
    owner: 'agent',
    summary: 'Export change events (audit trail).',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'changes_export',
    defaultTimeoutMs: 8000
  },
  'changes.filters.set': {
    id: 'changes.filters.set',
    domain: 'ui',
    owner: 'agent',
    summary: 'Update Changes panel filters (symbol/range/limit).',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'changes_filters_set',
    defaultTimeoutMs: 3000
  },
  'ledger.stats': {
    id: 'ledger.stats',
    domain: 'ledger',
    owner: 'agent',
    summary: 'Fetch trade ledger stats.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'ledger_stats',
    defaultTimeoutMs: 4000
  },
  'dashboard.session.select': {
    id: 'dashboard.session.select',
    domain: 'ui',
    owner: 'agent',
    summary: 'Select a dashboard session and filters.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'dashboard_session_select',
    defaultTimeoutMs: 3000
  },
  'dashboard.refresh': {
    id: 'dashboard.refresh',
    domain: 'ui',
    owner: 'agent',
    summary: 'Refresh the performance dashboard data.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'dashboard_refresh',
    defaultTimeoutMs: 3000
  },
  'dashboard.action.apply': {
    id: 'dashboard.action.apply',
    domain: 'ui',
    owner: 'agent',
    summary: 'Apply a dashboard experiment/champion.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'dashboard_action_apply',
    defaultTimeoutMs: 3000
  },
  'dashboard.action.promote': {
    id: 'dashboard.action.promote',
    domain: 'ui',
    owner: 'agent',
    summary: 'Promote a dashboard experiment/champion to a watch profile.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'dashboard_action_promote',
    defaultTimeoutMs: 3000
  },
  'dashboard.action.save_preset': {
    id: 'dashboard.action.save_preset',
    domain: 'ui',
    owner: 'agent',
    summary: 'Save a dashboard experiment/champion to preset library.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'dashboard_action_save_preset',
    defaultTimeoutMs: 3000
  },
  'dashboard.autopilot.target': {
    id: 'dashboard.autopilot.target',
    domain: 'ui',
    owner: 'agent',
    summary: 'Start a targeted Autopilot session for a regime key.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'dashboard_autopilot_target',
    defaultTimeoutMs: 4000
  },
  'mt5.connect': {
    id: 'mt5.connect',
    domain: 'mt5',
    owner: 'agent',
    summary: 'Connect to the MT5 tick bridge.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'mt5_connect',
    defaultTimeoutMs: 6000
  },
  'mt5.disconnect': {
    id: 'mt5.disconnect',
    domain: 'mt5',
    owner: 'agent',
    summary: 'Disconnect from the MT5 tick bridge.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'mt5_disconnect',
    defaultTimeoutMs: 4000
  },
  'mt5.ws_url.set': {
    id: 'mt5.ws_url.set',
    domain: 'mt5',
    owner: 'agent',
    summary: 'Set MT5 bridge WebSocket URL.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'mt5_ws_url_set',
    defaultTimeoutMs: 3000
  },
  'mt5.symbols.set': {
    id: 'mt5.symbols.set',
    domain: 'mt5',
    owner: 'agent',
    summary: 'Set MT5 subscribed symbols list.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'mt5_symbols_set',
    defaultTimeoutMs: 3000
  },
  'mt5.symbols.apply': {
    id: 'mt5.symbols.apply',
    domain: 'mt5',
    owner: 'agent',
    summary: 'Apply MT5 symbol subscriptions.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'mt5_symbols_apply',
    defaultTimeoutMs: 3000
  },
  'mt5.symbols.search': {
    id: 'mt5.symbols.search',
    domain: 'mt5',
    owner: 'agent',
    summary: 'Search MT5 broker symbols.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'mt5_symbols_search',
    defaultTimeoutMs: 4000
  },
  'mt5.log.open': {
    id: 'mt5.log.open',
    domain: 'mt5',
    owner: 'agent',
    summary: 'Open MT5 bridge log file.',
    safety: { gates: [], requiresConfirmation: false },
    auditEventType: 'mt5_log_open',
    defaultTimeoutMs: 3000
  },
  'trade.propose': {
    id: 'trade.propose',
    domain: 'broker',
    owner: 'agent',
    summary: 'Propose a trade setup.',
    requiresBroker: true,
    safety: { gates: ['risk', 'permissions'], requiresConfirmation: false },
    auditEventType: 'trade_propose',
    defaultTimeoutMs: 4000
  }
};

export const ACTION_ID_BY_TOOL: Partial<Record<AgentToolActionType, string>> = {
  GET_SYSTEM_STATE: 'system.snapshot',
  GET_APP_SNAPSHOT: 'system.capture_snapshot',
  GET_NATIVE_CHART_SNAPSHOT: 'chart.snapshot',
  GET_BACKTEST_SUMMARY: 'backtest.summary',
  GET_BACKTEST_TRAINING_PACK: 'backtest.training_pack',
  RUN_BACKTEST_OPTIMIZATION: 'backtest.optimization',
  START_BACKTEST_OPTIMIZER: 'backtest.optimizer.start',
  GET_BACKTEST_OPTIMIZER_STATUS: 'backtest.optimizer.status',
  GET_BACKTEST_OPTIMIZER_RESULTS: 'backtest.optimizer.results',
  GET_OPTIMIZER_WINNER_PARAMS: 'backtest.optimizer.winner_params',
  SAVE_OPTIMIZER_WINNER_PRESET: 'backtest.optimizer.save_preset',
  PROPOSE_BACKTEST_OPTIMIZATION_REFINEMENT: 'backtest.optimizer.refine',
  RUN_BACKTEST_OPTIMIZATION_CHAIN: 'backtest.optimizer.chain',
  START_RESEARCH_AUTOPILOT: 'research.autopilot.start',
  GET_RESEARCH_AUTOPILOT_STATUS: 'research.autopilot.status',
  GET_RESEARCH_AUTOPILOT_RESULTS: 'research.autopilot.results',
  STOP_RESEARCH_AUTOPILOT: 'research.autopilot.stop',
  GET_BROKER_QUOTE: 'broker.quote',
  GET_AGENT_MEMORY: 'agent.memory.get',
  LIST_AGENT_MEMORY: 'agent.memory.list',
  LIST_SETUP_WATCHERS: 'watcher.list',
  CREATE_SETUP_WATCHER: 'watcher.create',
  UPDATE_SETUP_WATCHER: 'watcher.update',
  DELETE_SETUP_WATCHER: 'watcher.delete',
  GET_SETUP_SIGNALS: 'watcher.signals',
  EXPLAIN_SETUP_SIGNAL: 'watcher.signal.explain',
  LIST_SETUP_LIBRARY: 'setup.library.list',
  CREATE_WATCHER_FROM_LIBRARY: 'setup.library.create_watcher',
  UPDATE_AGENT_CAPABILITIES: 'agent.capabilities.update'
};

export const ACTION_ID_BY_BROKER: Partial<Record<BrokerActionType, string>> = {
  REFRESH_BROKER: 'broker.refresh_snapshot',
  CLOSE_POSITION: 'broker.close_position',
  CANCEL_ORDER: 'broker.cancel_order',
  MODIFY_POSITION: 'broker.modify_position',
  MODIFY_ORDER: 'broker.modify_order'
};

const isDevCatalogRuntime = () => {
  try {
    return Boolean(typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV);
  } catch {
    return false;
  }
};

const emitActionCatalogDiagnostic = (payload: {
  level: 'info' | 'warn' | 'error';
  warnings: string[];
  missingPrereqCount: number;
  errors: string[];
}) => {
  try {
    const target = typeof window !== 'undefined' && window && typeof window.dispatchEvent === 'function'
      ? window
      : null;
    if (!target || typeof CustomEvent === 'undefined') return;
    target.dispatchEvent(new CustomEvent('glass:action-catalog-diagnostic', {
      detail: {
        source: 'action_catalog_validate',
        ...payload
      }
    }));
  } catch {
    // ignore diagnostics transport failures
  }
};

const validateActionCatalog = (catalog: Record<string, ActionDefinition>) => {
  const seen = new Set<string>();
  const errors: string[] = [];
  const warnings: string[] = [];
  let missingPrereqCount = 0;

  for (const [key, def] of Object.entries(catalog)) {
    if (!def || typeof def !== 'object') {
      errors.push(`Missing definition for action key "${key}".`);
      continue;
    }
    if (def.id !== key) {
      errors.push(`Action key "${key}" has mismatched id "${def.id}".`);
    }
    if (seen.has(def.id)) {
      errors.push(`Duplicate action id "${def.id}".`);
    } else {
      seen.add(def.id);
    }

    if (!def.summary || typeof def.summary !== 'string') {
      warnings.push(`Action "${key}" missing summary.`);
    }
    if (!def.safety || typeof def.safety !== 'object') {
      warnings.push(`Action "${key}" missing safety metadata.`);
    } else {
      if (def.safety.gates != null && !Array.isArray(def.safety.gates)) {
        warnings.push(`Action "${key}" has invalid safety.gates metadata.`);
      }
      if (def.safety.requiresConfirmation != null && typeof def.safety.requiresConfirmation !== 'boolean') {
        warnings.push(`Action "${key}" has invalid safety.requiresConfirmation metadata.`);
      }
    }
    if (!Object.prototype.hasOwnProperty.call(def, 'prerequisites')) {
      missingPrereqCount += 1;
    } else if (def.prerequisites != null && !Array.isArray(def.prerequisites)) {
      warnings.push(`Action "${key}" has invalid prerequisites metadata.`);
    }
    if (def.requiresVision != null && typeof def.requiresVision !== 'boolean') {
      warnings.push(`Action "${key}" has invalid requiresVision metadata.`);
    }
    if (def.requiresBroker != null && typeof def.requiresBroker !== 'boolean') {
      warnings.push(`Action "${key}" has invalid requiresBroker metadata.`);
    }
    if (def.defaultTimeoutMs != null && !Number.isFinite(Number(def.defaultTimeoutMs))) {
      warnings.push(`Action "${key}" has invalid defaultTimeoutMs metadata.`);
    }
  }

  if (errors.length === 0 && warnings.length === 0) return;
  const isDev = isDevCatalogRuntime();
  emitActionCatalogDiagnostic({
    level: errors.length > 0 ? 'error' : (warnings.length > 0 || missingPrereqCount > 0 ? 'info' : 'info'),
    warnings,
    missingPrereqCount,
    errors
  });
  if (warnings.length > 0) {
    const message = `Action catalog validation warnings:\n${warnings.join('\n')}`;
    if (isDev) {
      console.warn(message);
    } else {
      console.info(message);
    }
  }
  if (missingPrereqCount > 0) {
    const message = `Action catalog validation warnings:\n${missingPrereqCount} actions missing prerequisites metadata (add prerequisites: []).`;
    if (isDev) {
      console.warn(message);
    } else {
      console.info(message);
    }
  }
  if (errors.length === 0) return;
  const message = `Action catalog validation failed:\n${errors.join('\n')}`;
  if (isDev) {
    throw new Error(message);
  }
  // In production, log but avoid crashing the app.
  console.error(message);
};

validateActionCatalog(ACTION_CATALOG);

export const getActionDefinition = (id: string) => ACTION_CATALOG[id] || null;

export const listActionDefinitions = () => Object.values(ACTION_CATALOG);

const TOOL_BY_ACTION_ID = Object.entries(ACTION_ID_BY_TOOL).reduce((acc, [tool, actionId]) => {
  if (actionId) acc[actionId] = tool as AgentToolActionType;
  return acc;
}, {} as Record<string, AgentToolActionType>);

const BROKER_BY_ACTION_ID = Object.entries(ACTION_ID_BY_BROKER).reduce((acc, [broker, actionId]) => {
  if (actionId) acc[actionId] = broker as BrokerActionType;
  return acc;
}, {} as Record<string, BrokerActionType>);

export const getToolTypeForActionId = (id: string) => TOOL_BY_ACTION_ID[id];

export const getBrokerActionTypeForActionId = (id: string) => BROKER_BY_ACTION_ID[id];

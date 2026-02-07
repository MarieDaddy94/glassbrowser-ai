export type OpenAiTool = {
  type: 'function';
  name: string;
  description: string;
  parameters?: Record<string, any>;
};

export const tradeTool = {
  type: "function",
  name: "proposeTrade",
  description: "Propose a trading setup. If AutoPilot is enabled, this may execute automatically.",
  parameters: {
    type: "object",
    properties: {
      symbol: { type: "string", description: "The ticker symbol (e.g., EURUSD, BTCUSD)" },
      action: { type: "string", description: "BUY or SELL" },
      entryPrice: { type: "number", description: "The proposed entry price" },
      stopLoss: { type: "number", description: "The stop loss price level" },
      takeProfit: { type: "number", description: "The take profit price level" },
      reason: { type: "string", description: "A brief technical explanation for why this trade is being taken." }
    },
    required: ["symbol", "action", "entryPrice", "stopLoss", "takeProfit", "reason"]
  }
};

export const riskTool = {
  type: "function",
  name: "updateRiskSettings",
  description: "Update the AutoPilot risk management settings, including spread limits.",
  parameters: {
    type: "object",
    properties: {
      maxDailyLoss: { type: "number", description: "Maximum allowable loss in dollars per day." },
      mode: { type: "string", description: "AutoPilot mode (custom, scalper, day, trend, swing)." },
      riskPerTrade: { type: "number", description: "Percentage of account equity to risk per trade (e.g., 1 for 1%)." },
      customRiskPerTrade: { type: "number", description: "Custom mode risk per trade override (percent)." },
      scalperRiskPerTrade: { type: "number", description: "Scalper mode risk per trade (percent)." },
      dayRiskPerTrade: { type: "number", description: "Day mode risk per trade (percent)." },
      trendRiskPerTrade: { type: "number", description: "Trend mode risk per trade (percent)." },
      swingRiskPerTrade: { type: "number", description: "Swing mode risk per trade (percent)." },
      spreadLimitModel: { type: "string", description: "Spread limit mode: none, percent, or atr." },
      spreadLimitPct: { type: "number", description: "Spread limit percent of price (e.g., 0.2 for 0.2%)." },
      spreadLimitAtrMult: { type: "number", description: "Spread limit as ATR multiple (e.g., 0.3 for 0.3x ATR14 on 1m)." },
      stopModel: { type: "string", description: "Default stop model: percent or atr." },
      stopPercent: { type: "number", description: "Default stop distance as percent of price (e.g., 0.2 for 0.2%)." },
      stopAtrMult: { type: "number", description: "Default stop distance as ATR multiple (e.g., 1.0 for 1x ATR14)." },
      defaultRR: { type: "number", description: "Default RR used to derive TP when auto-fixing stops (e.g., 2)." },
      lotSize: { type: "number", description: "Default lot size (lots) used when executing AI trades." },
      maxOpenPositions: { type: "number", description: "Maximum number of concurrent open positions." },
      maxOrdersPerMinute: { type: "number", description: "Maximum new orders per minute (0 disables the cap)." },
      killSwitch: { type: "boolean", description: "Emergency stop; when true, AutoPilot will not execute new trades." },
      perSymbolMaxPositions: { type: "number", description: "Maximum open positions per symbol (0 disables the cap)." },
      perSymbolMaxLot: { type: "number", description: "Maximum lot size per symbol (0 disables the cap)." },
      symbolCapsRaw: { type: "string", description: "Per-symbol overrides, one per line: SYMBOL,MAX_LOT,MAX_POSITIONS." },
      symbolAllowlistRaw: { type: "string", description: "Optional allowlist of tradable symbols (comma or newline separated)." },
      maxConsecutiveLosses: { type: "number", description: "Maximum consecutive losses before blocking new trades (0 disables the cap)." },
      symbolGroupMapRaw: { type: "string", description: "Symbol group map, per line: GROUP: SYMBOL1, SYMBOL2 or SYMBOL, GROUP." },
      groupCapsRaw: { type: "string", description: "Group caps, per line: GROUP,MAX_LOT,MAX_POSITIONS." },
      driftActionWarn: { type: "string", description: "Drift action on WARN: none, paper, suggest, or disable." },
      driftActionPoor: { type: "string", description: "Drift action on POOR: none, paper, suggest, or disable." },
      driftActionCooldownHours: { type: "number", description: "Cooldown (hours) between repeated drift actions." },
      driftAutoRetest: { type: "boolean", description: "Auto-retest watchers when drift is detected." },
      driftRetestCooldownHours: { type: "number", description: "Cooldown (hours) between drift re-tests per watcher." },
      driftRetestRangeDays: { type: "number", description: "Range (days) used for drift re-test backtests." },
      driftRetestMaxCombos: { type: "number", description: "Max combos to test during drift re-test." },
      executionMode: { type: "string", description: "Execution mode: live, paper, or shadow." },
      enabled: { type: "boolean", description: "Enable or disable AutoPilot execution." }
    }
  }
};

export const brokerRefreshTool = {
  type: "function",
  name: "refreshBrokerSnapshot",
  description: "Request a fresh broker snapshot (balances, positions, orders). Rate-limited by the app.",
  parameters: {
    type: "object",
    properties: {
      scope: {
        type: "string",
        description: "What to refresh: snapshot, orders, metrics, or all.",
        enum: ["snapshot", "orders", "metrics", "all"]
      },
      reason: { type: "string", description: "Optional reason for requesting a refresh." }
    }
  }
};

export const systemStateTool = {
  type: "function",
  name: "getSystemState",
  description: "Fetch a consolidated system state snapshot (broker, autopilot, watchers, chart, backtester, tabs).",
  parameters: {
    type: "object",
    properties: {
      detail: {
        type: "string",
        enum: ["summary", "full"],
        description: "Summary returns compact counts; full includes lists where available."
      },
      maxItems: { type: "number", description: "Optional cap for list sizes (watchers, signals, positions)." },
      reason: { type: "string", description: "Why the system state is needed." }
    }
  }
};

export const appSnapshotTool = {
  type: "function",
  name: "getAppSnapshot",
  description: "Capture a native snapshot of the app window for visual debugging.",
  parameters: {
    type: "object",
    properties: {
      format: { type: "string", enum: ["jpeg", "png"], description: "Image format (jpeg default)." },
      quality: { type: "number", description: "JPEG quality (1-100). Ignored for PNG." },
      width: { type: "number", description: "Optional resize width (px)." },
      height: { type: "number", description: "Optional resize height (px)." },
      save: { type: "boolean", description: "Save snapshot to disk and return path." },
      label: { type: "string", description: "Optional label for the snapshot." },
      reason: { type: "string", description: "Why the snapshot is needed." }
    }
  }
};

export const actionCatalogTool = {
  type: "function",
  name: "run_action_catalog",
  description: "Execute a catalog action through the app action task tree (agentic control plane, including UI navigation). Use action_flow.list to discover learned flows, then action_flow.run with intentKey or payload.intent to run one. For multi-step flows, provide steps/sequence and the app will build a playbook.",
  parameters: {
    type: "object",
    properties: {
      actionId: { type: "string", description: "Action catalog id (e.g., backtest.optimizer.chain, watcher.create, ui.panel.open, ui.tab.open)." },
      payload: { type: "object", description: "Arguments for the action (matches the tool or broker payload)."},
      steps: {
        type: "array",
        description: "Optional multi-step action sequence. If provided, the app will queue a playbook for the steps.",
        items: {
          type: "object",
          properties: {
            actionId: { type: "string", description: "Action catalog id for this step." },
            payload: { type: "object", description: "Optional payload for the step action." },
            label: { type: "string", description: "Optional label for the step." },
            stage: { type: "string", description: "Optional stage (observe/evaluate/decide/verify/execute/monitor/review)." },
            storeAs: { type: "string", description: "Optional context key to store step output." },
            optional: { type: "boolean", description: "Whether the step is optional." },
            requiresConfirmation: { type: "boolean", description: "Whether this step needs confirmation." },
            requiresUser: { type: "boolean", description: "Whether this step requires user input." },
            skipIfMissing: { type: "string", description: "Skip if a referenced context path is missing." },
            timeoutMs: { type: "number", description: "Optional step timeout in ms." },
            maxRetries: { type: "number", description: "Optional step retry count." },
            retryDelayMs: { type: "number", description: "Optional step retry delay in ms." }
          },
          required: ["actionId"]
        }
      },
      sequence: {
        type: "array",
        description: "Shorthand multi-step sequence (list of actionIds).",
        items: { type: "string" }
      },
      intent: { type: "string", description: "Optional intent label for action flows or sequences." },
      intentKey: { type: "string", description: "Optional intent key for action flows." },
      preferFlow: { type: "boolean", description: "Prefer a learned action flow if intent is provided." },
      forceAction: { type: "boolean", description: "Force the requested actionId instead of action_flow.run." },
      symbol: { type: "string", description: "Optional symbol context." },
      timeframe: { type: "string", description: "Optional timeframe context." },
      strategy: { type: "string", description: "Optional strategy context." },
      mode: { type: "string", description: "Optional mode context (suggest/paper/live)." },
      dedupeKey: { type: "string", description: "Optional dedupe key to avoid duplicate tasks." },
      source: { type: "string", description: "Optional action source label." },
      reason: { type: "string", description: "Why this action is being queued." }
    },
    required: ["actionId"]
  }
};

export const closePositionTool = {
  type: "function",
  name: "closePosition",
  description: "Request to close an open position by positionId. This will require user confirmation.",
  parameters: {
    type: "object",
    properties: {
      positionId: { type: "string", description: "Broker position ID to close." },
      qty: { type: "number", description: "Optional quantity to close (lots)." },
      symbol: { type: "string", description: "Optional symbol label for display." },
      reason: { type: "string", description: "Why the position should be closed." }
    }
  }
};

export const cancelOrderTool = {
  type: "function",
  name: "cancelOrder",
  description: "Request to cancel an open order by orderId. This will require user confirmation.",
  parameters: {
    type: "object",
    properties: {
      orderId: { type: "string", description: "Broker order ID to cancel." },
      symbol: { type: "string", description: "Optional symbol label for display." },
      reason: { type: "string", description: "Why the order should be cancelled." }
    }
  }
};

export const modifyPositionTool = {
  type: "function",
  name: "modifyPosition",
  description: "Request to modify an open position's stop loss or take profit. Only include trailingOffset if the user explicitly asks for a trailing stop. This will require user confirmation.",
  parameters: {
    type: "object",
    properties: {
      positionId: { type: "string", description: "Broker position ID to modify." },
      symbol: { type: "string", description: "Optional symbol label for display." },
      stopLoss: { type: "number", description: "New stop loss price level." },
      takeProfit: { type: "number", description: "New take profit price level." },
      stopLossUsd: { type: "number", description: "Dollar risk amount for stop loss (app converts to price)." },
      takeProfitUsd: { type: "number", description: "Dollar target amount for take profit (app converts to price)." },
      trailingOffset: { type: "number", description: "Optional trailing offset." },
      clearStopLoss: { type: "boolean", description: "Set true to remove stop loss." },
      clearTakeProfit: { type: "boolean", description: "Set true to remove take profit." },
      reason: { type: "string", description: "Why the position should be modified." }
    }
  }
};

export const modifyOrderTool = {
  type: "function",
  name: "modifyOrder",
  description: "Request to modify an open order's price, quantity, or SL/TP. Use this for pending orders (not filled positions). This will require user confirmation.",
  parameters: {
    type: "object",
    properties: {
      orderId: { type: "string", description: "Broker order ID to modify." },
      symbol: { type: "string", description: "Optional symbol label for display." },
      price: { type: "number", description: "New order price level (limit/stop orders)." },
      qty: { type: "number", description: "New order quantity (lots)." },
      stopLoss: { type: "number", description: "New stop loss price level." },
      takeProfit: { type: "number", description: "New take profit price level." },
      clearStopLoss: { type: "boolean", description: "Set true to remove stop loss." },
      clearTakeProfit: { type: "boolean", description: "Set true to remove take profit." },
      reason: { type: "string", description: "Why the order should be modified." }
    }
  }
};

export const nativeChartSnapshotTool = {
  type: "function",
  name: "getNativeChartSnapshot",
  description: "Capture a snapshot of the native TradeLocker chart for visual context and overlays.",
  parameters: {
    type: "object",
    properties: {
      symbol: { type: "string", description: "Optional symbol to focus the snapshot on." },
      timeframe: { type: "string", description: "Optional timeframe hint (e.g., 15m, 1H, 4H)." },
      reason: { type: "string", description: "Why the snapshot is needed." }
    }
  }
};

export const backtestSummaryTool = {
  type: "function",
  name: "getBacktestSummary",
  description: "Fetch the current backtest summary and stats from the Backtester panel.",
  parameters: {
    type: "object",
    properties: {
      symbol: { type: "string", description: "Optional symbol to focus the backtest summary on." },
      timeframe: { type: "string", description: "Optional timeframe hint (e.g., 15m, 1H, 4H)." },
      reason: { type: "string", description: "Why the backtest summary is needed." }
    }
  }
};

export const backtestTrainingPackTool = {
  type: "function",
  name: "getBacktestTrainingPack",
  description: "Export the current backtest training pack JSON for agent learning.",
  parameters: {
    type: "object",
    properties: {
      maxEpisodes: { type: "number", description: "Optional maximum number of episodes to include." },
      offset: { type: "number", description: "Optional episode offset (0 = oldest). Used for chunked retrieval." },
      limit: { type: "number", description: "Optional number of episodes to include starting at offset." },
      symbol: { type: "string", description: "Optional symbol to focus the training pack on." },
      timeframe: { type: "string", description: "Optional timeframe hint (e.g., 15m, 1H, 4H)." },
      reason: { type: "string", description: "Why the training pack is needed." }
    }
  }
};

export const backtestOptimizationTool = {
  type: "function",
  name: "run_backtest_optimization",
  description: "Run a headless grid search of backtests on broker history to rank parameter sets for a given strategy. Returns summary/top configs, not full trade logs.",
  parameters: {
    type: "object",
    properties: {
      symbol: { type: "string", description: "Symbol to test (e.g., XAUUSD, BTCUSD)." },
      symbols: { type: "array", items: { type: "string" }, description: "Optional list of symbols to batch run." },
        strategy: {
          type: "string",
          enum: ["RANGE_BREAKOUT", "BREAK_RETEST", "FVG_RETRACE", "TREND_PULLBACK", "MEAN_REVERSION", "AUTO", "CUSTOM"],
          description: "Strategy logic to test. Use AUTO/CUSTOM with strategyDescription if needed."
        },
        strategyDescription: {
          type: "string",
          description: "Optional custom strategy description to guide the optimizer when using AUTO/CUSTOM."
        },
      timeframe: { type: "string", description: "Timeframe/resolution for candles (e.g., 1m, 5m, 15m, 1H)." },
      timeframes: { type: "array", items: { type: "string" }, description: "Optional list of timeframes to batch run." },
      rangeDays: { type: "number", description: "Number of days of history to load." },
      timeFilter: {
        type: "object",
        properties: {
          startHour: { type: "number", description: "Session start hour (0-23)." },
          endHour: { type: "number", description: "Session end hour (0-23)." },
          timezone: { type: "string", enum: ["utc", "local"], description: "Timezone for the session hours." }
        }
      },
        params: {
          type: "object",
          description: "Optional single param set to seed a grid (values are expanded into arrays)."
        },
        paramGrid: {
        type: "object",
        description: "Grid values per parameter; only relevant params for the strategy are used.",
        properties: {
          lookbackBars: { type: "array", items: { type: "number" } },
          atrPeriod: { type: "array", items: { type: "number" } },
          atrMult: { type: "array", items: { type: "number" } },
          rr: { type: "array", items: { type: "number" } },
          cooldownBars: { type: "array", items: { type: "number" } },
          breakoutMode: { type: "array", items: { type: "string", enum: ["close", "wick"] } },
          bufferAtrMult: { type: "array", items: { type: "number" } },
          retestBars: { type: "array", items: { type: "number" } },
          retestBufferAtrMult: { type: "array", items: { type: "number" } },
          retestConfirm: { type: "array", items: { type: "string", enum: ["touch", "close"] } },
          maxWaitBars: { type: "array", items: { type: "number" } },
          entryMode: { type: "array", items: { type: "string", enum: ["mid", "edge"] } },
          minGapAtrMult: { type: "array", items: { type: "number" } },
          fastEma: { type: "array", items: { type: "number" } },
          slowEma: { type: "array", items: { type: "number" } },
          pullbackEma: { type: "array", items: { type: "string", enum: ["fast", "slow"] } },
          confirmMode: { type: "array", items: { type: "string", enum: ["touch", "close"] } },
          minTrendBars: { type: "array", items: { type: "number" } },
          smaPeriod: { type: "array", items: { type: "number" } },
          bandAtrMult: { type: "array", items: { type: "number" } },
          stopAtrMult: { type: "array", items: { type: "number" } },
          useRsiFilter: { type: "array", items: { type: "boolean" } },
          rsiPeriod: { type: "array", items: { type: "number" } },
          rsiOversold: { type: "array", items: { type: "number" } },
          rsiOverbought: { type: "array", items: { type: "number" } }
        }
      },
      executionPreset: {
        type: "string",
        enum: ["lite", "standard", "strict"],
        description: "Execution realism preset for backtest costs/slippage."
      },
      execution: { type: "object", description: "Optional execution model overrides (spread/slippage/commission/partials)." },
      maxCombos: { type: "number", description: "Optional cap on total parameter combinations to test." },
      presetKey: { type: "string", description: "Optional preset key to reuse a saved grid if paramGrid is omitted." },
      usePreset: { type: "boolean", description: "When true, prefer a saved preset grid if available." }
    },
    required: ["symbol", "strategy"]
  }
};

export const backtestOptimizerStartTool = {
  type: "function",
  name: "start_backtest_optimizer",
  description: "Start a multi-objective optimizer loop (train/test split) to improve win rate and drawdown for a backtest run (single round). For a second pass/refinement, use run_backtest_optimization_chain. Returns a session id.",
  parameters: {
    type: "object",
    properties: {
      baselineRunId: { type: "string", description: "Optional backtest run id to optimize from." },
      symbol: { type: "string", description: "Symbol to optimize (e.g., XAUUSD)." },
      timeframe: { type: "string", description: "Timeframe/resolution for candles (e.g., 15m, 1H)." },
        strategy: {
          type: "string",
          enum: ["RANGE_BREAKOUT", "BREAK_RETEST", "FVG_RETRACE", "TREND_PULLBACK", "MEAN_REVERSION", "AUTO", "CUSTOM"],
          description: "Strategy logic to optimize. Use AUTO/CUSTOM with strategyDescription if needed."
        },
        strategyDescription: {
          type: "string",
          description: "Optional custom strategy description to guide the optimizer when using AUTO/CUSTOM."
        },
      rangeDays: { type: "number", description: "Number of days of history to load." },
      maxCombos: { type: "number", description: "Optional cap on total parameter combinations to test." },
        params: {
          type: "object",
          description: "Optional single param set to seed a grid (values are expanded into arrays)."
        },
        paramGrid: { type: "object", description: "Parameter grid to search (same format as run_backtest_optimization)." },
      searchSpacePreset: { type: "string", description: "Optional preset key to reuse a saved grid if paramGrid is omitted." },
      objectivePreset: { type: "string", description: "Objective preset id (winrate_dd, balanced, aggressive)." },
      objective: { type: "object", description: "Optional objective overrides (minTradeCount, maxDrawdown, minProfitFactor, weights)." },
      validation: {
        type: "object",
        properties: {
          mode: { type: "string", enum: ["percent", "last_days", "walk_forward"] },
          splitPercent: { type: "number" },
          lastDays: { type: "number" },
          trainDays: { type: "number" },
          testDays: { type: "number" },
          stepDays: { type: "number" },
          minTrades: { type: "number" }
        }
      },
      executionPreset: {
        type: "string",
        enum: ["lite", "standard", "strict"],
        description: "Execution realism preset for backtest costs/slippage."
      },
      execution: { type: "object", description: "Optional execution model overrides (spread/slippage/commission/partials)." },
      reason: { type: "string", description: "Why the optimizer loop is needed." }
    }
  }
};

export const backtestOptimizerStatusTool = {
  type: "function",
  name: "get_backtest_optimizer_status",
  description: "Fetch status/progress for a running backtest optimizer session.",
  parameters: {
    type: "object",
    properties: {
      sessionId: { type: "string", description: "Optimizer session id." },
      baselineRunId: { type: "string", description: "Optional baseline run id to resolve the latest session." },
      symbol: { type: "string", description: "Optional symbol to resolve the latest session." },
      timeframe: { type: "string", description: "Optional timeframe to resolve the latest session." }
    }
  }
};

export const backtestOptimizerResultsTool = {
  type: "function",
  name: "get_backtest_optimizer_results",
  description: "Fetch the results (recommended config, Pareto set) from an optimizer session.",
  parameters: {
    type: "object",
    properties: {
      sessionId: { type: "string", description: "Optimizer session id." },
      baselineRunId: { type: "string", description: "Optional baseline run id to resolve the latest session." },
      symbol: { type: "string", description: "Optional symbol to resolve the latest session." },
      timeframe: { type: "string", description: "Optional timeframe to resolve the latest session." }
    }
  }
};

export const optimizerWinnerParamsTool = {
  type: "function",
  name: "get_optimizer_winner_params",
  description: "Fetch the exact best parameter set from an optimizer session or winner id.",
  parameters: {
    type: "object",
    properties: {
      winnerId: { type: "string", description: "Optional optimizer winner id." },
      sessionId: { type: "string", description: "Optimizer session id." },
      round: { type: "number", description: "Optimizer round (1 or 2)." },
      symbol: { type: "string", description: "Optional symbol to resolve the latest winner." },
      timeframe: { type: "string", description: "Optional timeframe to resolve the latest winner." },
      strategy: { type: "string", description: "Optional strategy to resolve the latest winner." },
      includeHumanReadable: { type: "boolean", description: "Return a formatted setup spec in addition to raw params." },
      limit: { type: "number", description: "Optional max winners to return when listing." },
      reason: { type: "string", description: "Why the winner params are needed." }
    }
  }
};

export const optimizerWinnerPresetTool = {
  type: "function",
  name: "save_optimizer_winner_as_preset",
  description: "Save an optimizer winner as a backtest preset so it can be reused without re-running.",
  parameters: {
    type: "object",
    properties: {
      winnerId: { type: "string", description: "Optimizer winner id." },
      sessionId: { type: "string", description: "Optimizer session id (if winnerId not provided)." },
      round: { type: "number", description: "Optimizer round (1 or 2) if using sessionId." },
      symbol: { type: "string", description: "Symbol for the preset (fallback if winner not found)." },
      timeframe: { type: "string", description: "Timeframe for the preset (fallback if winner not found)." },
      strategy: { type: "string", description: "Strategy for the preset (fallback if winner not found)." },
      params: { type: "object", description: "Optional params to save if winner lookup fails." },
      presetName: { type: "string", description: "Optional friendly name for the preset." },
      presetKey: { type: "string", description: "Optional custom preset key." },
      tags: { type: "array", items: { type: "string" }, description: "Optional tags for the preset." },
      reason: { type: "string", description: "Why the preset is being saved." }
    }
  }
};

export const backtestOptimizerRefinementTool = {
  type: "function",
  name: "propose_backtest_optimization_refinement",
  description: "Propose a refined parameter grid and objective preset based on the latest optimizer results.",
  parameters: {
    type: "object",
    properties: {
      sessionId: { type: "string", description: "Optimizer session id to refine." },
      baselineRunId: { type: "string", description: "Optional baseline run id to resolve the latest session." },
      symbol: { type: "string", description: "Optional symbol to resolve the latest session." },
      timeframe: { type: "string", description: "Optional timeframe to resolve the latest session." },
      reason: { type: "string", description: "Why a refinement proposal is needed." }
    }
  }
};

export const backtestOptimizationChainTool = {
  type: "function",
  name: "run_backtest_optimization_chain",
  description: "Run a two-round optimization chain: initial optimizer session followed by a refined round based on diagnostics.",
  parameters: {
    type: "object",
    properties: {
      baselineRunId: { type: "string", description: "Optional backtest run id to optimize from." },
      symbol: { type: "string", description: "Symbol to optimize (e.g., XAUUSD)." },
      timeframe: { type: "string", description: "Timeframe/resolution for candles (e.g., 15m, 1H)." },
        strategy: {
          type: "string",
          enum: ["RANGE_BREAKOUT", "BREAK_RETEST", "FVG_RETRACE", "TREND_PULLBACK", "MEAN_REVERSION", "AUTO", "CUSTOM"],
          description: "Strategy logic to optimize. Use AUTO/CUSTOM with strategyDescription if needed."
        },
        strategyDescription: {
          type: "string",
          description: "Optional custom strategy description to guide the optimizer when using AUTO/CUSTOM."
        },
      rangeDays: { type: "number", description: "Number of days of history to load." },
      maxCombos: { type: "number", description: "Optional cap on total parameter combinations to test." },
        params: {
          type: "object",
          description: "Optional single param set to seed a grid (values are expanded into arrays)."
        },
        paramGrid: { type: "object", description: "Parameter grid to search (same format as run_backtest_optimization)." },
      searchSpacePreset: { type: "string", description: "Optional preset key to reuse a saved grid if paramGrid is omitted." },
      objectivePreset: { type: "string", description: "Objective preset id (winrate_dd, balanced, aggressive)." },
      objective: { type: "object", description: "Optional objective overrides (minTradeCount, maxDrawdown, minProfitFactor, weights)." },
      validation: {
        type: "object",
        properties: {
          mode: { type: "string", enum: ["percent", "last_days", "walk_forward"] },
          splitPercent: { type: "number" },
          lastDays: { type: "number" },
          trainDays: { type: "number" },
          testDays: { type: "number" },
          stepDays: { type: "number" },
          minTrades: { type: "number" }
        }
      },
      executionPreset: {
        type: "string",
        enum: ["lite", "standard", "strict"],
        description: "Execution realism preset for backtest costs/slippage."
      },
      execution: { type: "object", description: "Optional execution model overrides (spread/slippage/commission/partials)." },
      rounds: { type: "number", description: "Number of rounds to run (1 or 2)." },
      hypothesis: { type: "string", description: "Optional hypothesis to attach to the experiment note." },
      reason: { type: "string", description: "Why the optimization chain is needed." }
    },
    required: ["symbol", "strategy"]
  }
};

export const researchAutopilotStartTool = {
  type: "function",
  name: "start_research_autopilot",
  description: "Start a research autopilot session (multi-experiment optimizer chain with robustness checks).",
  parameters: {
    type: "object",
    properties: {
      symbol: { type: "string", description: "Symbol to research (e.g., XAUUSD)." },
      timeframe: { type: "string", description: "Timeframe/resolution for candles (e.g., 15m, 1H)." },
      strategy: {
        type: "string",
        enum: ["RANGE_BREAKOUT", "BREAK_RETEST", "FVG_RETRACE", "TREND_PULLBACK", "MEAN_REVERSION", "AUTO", "CUSTOM"],
        description: "Strategy logic to optimize. Use AUTO/CUSTOM with strategyDescription if needed."
      },
      strategyDescription: {
        type: "string",
        description: "Optional custom strategy description to guide the optimizer when using AUTO/CUSTOM."
      },
      rangeDays: { type: "number", description: "Number of days of history to load." },
      maxCombos: { type: "number", description: "Optional cap on total parameter combinations per round." },
      maxExperiments: { type: "number", description: "Number of experiments to run in this session." },
      maxRuntimeSec: { type: "number", description: "Maximum runtime (seconds) before stopping." },
      plateauLimit: { type: "number", description: "Stop after N experiments with no improvement." },
      params: {
        type: "object",
        description: "Optional single param set to seed a grid (values are expanded into arrays)."
      },
      paramGrid: { type: "object", description: "Parameter grid to search (same format as run_backtest_optimization)." },
      searchSpacePreset: { type: "string", description: "Optional preset key to reuse a saved grid if paramGrid is omitted." },
      objectivePreset: { type: "string", description: "Objective preset id (winrate_dd, balanced, aggressive)." },
      objective: { type: "object", description: "Optional objective overrides (minTradeCount, maxDrawdown, minProfitFactor, weights)." },
      validation: {
        type: "object",
        properties: {
          mode: { type: "string", enum: ["percent", "last_days", "walk_forward"] },
          splitPercent: { type: "number" },
          lastDays: { type: "number" },
          trainDays: { type: "number" },
          testDays: { type: "number" },
          stepDays: { type: "number" }
        }
      },
      robustness: {
        type: "object",
        properties: {
          spreadBpsVariants: { type: "array", items: { type: "number" } },
          slippagePctVariants: { type: "array", items: { type: "number" } },
          oosShiftDays: { type: "array", items: { type: "number" } }
        }
      },
      targetRegimeKey: { type: "string", description: "Optional regime key to target (e.g., high_range_ny)." },
      minTargetRegimeSamples: { type: "number", description: "Minimum evaluations in target regime before adopt." },
      reason: { type: "string", description: "Why the research autopilot is needed." }
    },
    required: ["symbol", "strategy"]
  }
};

export const researchAutopilotStatusTool = {
  type: "function",
  name: "get_research_autopilot_status",
  description: "Fetch status/progress for a research autopilot session.",
  parameters: {
    type: "object",
    properties: {
      sessionId: { type: "string", description: "Research session id." },
      symbol: { type: "string", description: "Optional symbol to resolve the latest session." },
      timeframe: { type: "string", description: "Optional timeframe to resolve the latest session." }
    }
  }
};

export const researchAutopilotResultsTool = {
  type: "function",
  name: "get_research_autopilot_results",
  description: "Fetch results (steps + best candidate) for a research autopilot session.",
  parameters: {
    type: "object",
    properties: {
      sessionId: { type: "string", description: "Research session id." },
      symbol: { type: "string", description: "Optional symbol to resolve the latest session." },
      timeframe: { type: "string", description: "Optional timeframe to resolve the latest session." }
    }
  }
};

export const researchAutopilotStopTool = {
  type: "function",
  name: "stop_research_autopilot",
  description: "Stop a running research autopilot session.",
  parameters: {
    type: "object",
    properties: {
      sessionId: { type: "string", description: "Research session id." },
      symbol: { type: "string", description: "Optional symbol to resolve the latest session." },
      timeframe: { type: "string", description: "Optional timeframe to resolve the latest session." },
      reason: { type: "string", description: "Why the session is being stopped." }
    }
  }
};

export const brokerQuoteTool = {
  type: "function",
  name: "getBrokerQuote",
  description: "Fetch the latest broker quote (bid/ask/mid/spread) for analysis/confirmation. Not required before proposeTrade; execution will fetch quotes.",
  parameters: {
    type: "object",
    properties: {
      symbol: { type: "string", description: "Symbol to fetch quotes for." },
      reason: { type: "string", description: "Why the quote is needed." }
    },
    required: ["symbol"]
  }
};

export const agentMemoryGetTool = {
  type: "function",
  name: "getAgentMemory",
  description: "Fetch a saved agent memory entry (backtest summary, symbol state, etc). Provide key/id or symbol/timeframe to fetch the latest match.",
  parameters: {
    type: "object",
    properties: {
      key: { type: "string", description: "Memory key (preferred)." },
      id: { type: "string", description: "Memory id (optional)." },
      symbol: { type: "string", description: "Optional symbol to fetch the latest memory for." },
      timeframe: { type: "string", description: "Optional timeframe to fetch the latest memory for." },
      kind: { type: "string", description: "Optional memory kind filter (e.g., backtest_summary)." },
      reason: { type: "string", description: "Why the memory is needed." }
    }
  }
};

export const agentMemoryListTool = {
  type: "function",
  name: "listAgentMemory",
  description: "List saved agent memory entries with optional filters.",
  parameters: {
    type: "object",
    properties: {
      symbol: { type: "string", description: "Optional symbol filter." },
      timeframe: { type: "string", description: "Optional timeframe filter." },
      kind: { type: "string", description: "Optional memory kind filter (e.g., backtest_summary)." },
      tags: { type: "array", items: { type: "string" }, description: "Optional tags to match." },
      limit: { type: "number", description: "Optional max number of entries to return." },
      reason: { type: "string", description: "Why the memory list is needed." }
    }
  }
};

export const setupWatcherListTool = {
  type: "function",
  name: "listSetupWatchers",
  description: "List active setup watchers and their latest status.",
  parameters: {
    type: "object",
    properties: {
      symbol: { type: "string", description: "Optional symbol filter." },
      timeframe: { type: "string", description: "Optional timeframe filter (e.g., 15m, 1H)." },
      strategy: { type: "string", description: "Optional strategy filter." },
      mode: { type: "string", enum: ["suggest", "paper", "live"], description: "Optional watcher mode filter." },
      enabled: { type: "boolean", description: "Optional enabled filter." },
      limit: { type: "number", description: "Optional max number of watchers to return." },
      reason: { type: "string", description: "Why the watcher list is needed." }
    }
  }
};

export const setupWatcherCreateTool = {
  type: "function",
  name: "createSetupWatcher",
  description: "Create a setup watcher to monitor live broker bars for signals. If winnerId or sessionId+round is provided, params are pulled from the optimizer winner.",
  parameters: {
    type: "object",
    properties: {
      winnerId: { type: "string", description: "Optional optimizer winner id to seed params." },
      sessionId: { type: "string", description: "Optional optimizer session id (for winner lookup)." },
      round: { type: "number", description: "Optional optimizer round (1 or 2) if using sessionId." },
      symbol: { type: "string", description: "Symbol to watch (e.g., XAUUSD)." },
      timeframe: { type: "string", description: "Timeframe (e.g., 15m, 1H)." },
      strategy: {
        type: "string",
        enum: ["RANGE_BREAKOUT", "BREAK_RETEST", "FVG_RETRACE", "TREND_PULLBACK", "MEAN_REVERSION"],
        description: "Strategy logic to watch."
      },
      params: { type: "object", description: "Optional strategy parameter overrides." },
      playbook: { type: "object", description: "Optional execution playbook (partials/trailing/breakeven)." },
      regime: { type: "string", enum: ["any", "trend", "range", "breakout"], description: "Optional regime gate for the watcher." },
      mode: { type: "string", enum: ["suggest", "paper", "live"], description: "Watcher mode." },
      enabled: { type: "boolean", description: "Enable/disable the watcher." },
      reason: { type: "string", description: "Why this watcher is being created." }
    }
  }
};

export const setupWatcherUpdateTool = {
  type: "function",
  name: "updateSetupWatcher",
  description: "Update an existing setup watcher by id or by filters.",
  parameters: {
    type: "object",
    properties: {
      watcherId: { type: "string", description: "Watcher id to update." },
      symbol: { type: "string", description: "Optional symbol filter to locate a watcher." },
      timeframe: { type: "string", description: "Optional timeframe filter." },
      strategy: { type: "string", description: "Optional strategy filter." },
      params: { type: "object", description: "Strategy parameter patch." },
      playbook: { type: "object", description: "Execution playbook patch (partials/trailing/breakeven)." },
      regime: { type: "string", enum: ["any", "trend", "range", "breakout"], description: "Optional regime gate update." },
      mode: { type: "string", enum: ["suggest", "paper", "live"], description: "New watcher mode." },
      enabled: { type: "boolean", description: "Enable/disable the watcher." },
      reason: { type: "string", description: "Why this watcher is being updated." }
    }
  }
};

export const setupWatcherDeleteTool = {
  type: "function",
  name: "deleteSetupWatcher",
  description: "Delete a setup watcher by id or by filters.",
  parameters: {
    type: "object",
    properties: {
      watcherId: { type: "string", description: "Watcher id to delete." },
      symbol: { type: "string", description: "Optional symbol filter to delete matching watchers." },
      timeframe: { type: "string", description: "Optional timeframe filter." },
      strategy: { type: "string", description: "Optional strategy filter." },
      mode: { type: "string", enum: ["suggest", "paper", "live"], description: "Optional mode filter." },
      reason: { type: "string", description: "Why the watcher is being deleted." }
    }
  }
};

export const setupSignalsTool = {
  type: "function",
  name: "getSetupSignals",
  description: "Fetch recent setup signals emitted by the live setup watchers.",
  parameters: {
    type: "object",
    properties: {
      watcherId: { type: "string", description: "Optional watcher id filter." },
      symbol: { type: "string", description: "Optional symbol filter." },
      timeframe: { type: "string", description: "Optional timeframe filter." },
      strategy: { type: "string", description: "Optional strategy filter." },
      sinceMs: { type: "number", description: "Only return signals after this epoch timestamp." },
      limit: { type: "number", description: "Optional max number of signals to return." },
      reason: { type: "string", description: "Why the signals are needed." }
    }
  }
};

export const explainSetupSignalTool = {
  type: "function",
  name: "explainSetupSignal",
  description: "Explain why the latest setup signal fired for a profile/watcher/symbol and provide evidence.",
  parameters: {
    type: "object",
    properties: {
      profileId: { type: "string", description: "Optional watch profile id to target." },
      watcherId: { type: "string", description: "Optional watcher id to target." },
      signalId: { type: "string", description: "Optional specific setup signal id." },
      symbol: { type: "string", description: "Optional symbol filter." },
      timeframe: { type: "string", description: "Optional timeframe filter." },
      includeSnapshot: { type: "boolean", description: "When true, include a chart snapshot with the explanation." },
      reason: { type: "string", description: "Why the explanation is needed." }
    }
  }
};

export const setupLibraryListTool = {
  type: "function",
  name: "listSetupLibrary",
  description: "List setup library entries scored from backtest optimization.",
  parameters: {
    type: "object",
    properties: {
      symbol: { type: "string", description: "Optional symbol filter." },
      timeframe: { type: "string", description: "Optional timeframe filter." },
      strategy: { type: "string", description: "Optional strategy filter." },
      tier: { type: "string", enum: ["S", "A", "B", "C", "D"], description: "Optional tier filter." },
      winRateTier: { type: "string", enum: ["WR70", "WR60", "WR50", "WR40", "WR30"], description: "Optional win rate tier filter." },
      limit: { type: "number", description: "Optional max number of entries to return." },
      reason: { type: "string", description: "Why the setup library is needed." }
    }
  }
};

export const setupLibraryWatcherTool = {
  type: "function",
  name: "createWatcherFromLibrary",
  description: "Create a setup watcher from a setup library entry key or filters.",
  parameters: {
    type: "object",
    properties: {
      key: { type: "string", description: "Library entry key or config key (preferred)." },
      symbol: { type: "string", description: "Optional symbol filter." },
      timeframe: { type: "string", description: "Optional timeframe filter." },
      strategy: { type: "string", description: "Optional strategy filter." },
      tier: { type: "string", enum: ["S", "A", "B", "C", "D"], description: "Optional tier filter." },
      winRateTier: { type: "string", enum: ["WR70", "WR60", "WR50", "WR40", "WR30"], description: "Optional win rate tier filter." },
      regime: { type: "string", enum: ["any", "trend", "range", "breakout"], description: "Optional regime gate for the watcher." },
      mode: { type: "string", enum: ["suggest", "paper", "live"], description: "Watcher mode." },
      enabled: { type: "boolean", description: "Enable/disable the watcher." },
      reason: { type: "string", description: "Why this watcher is being created." }
    }
  }
};

export const updateAgentCapabilitiesTool = {
  type: "function",
  name: "updateAgentCapabilities",
  description: "Update an agent's capability scope (tools/broker/trade/auto-execute).",
  parameters: {
    type: "object",
    properties: {
      agentId: { type: "string", description: "Target agent id (preferred if known)." },
      agentName: { type: "string", description: "Target agent name if id is unknown." },
      capabilities: {
        type: "object",
        properties: {
          tools: { type: "boolean", description: "Allow tool calls." },
          broker: { type: "boolean", description: "Allow broker actions (refresh/close/modify)." },
          trade: { type: "boolean", description: "Allow trade proposals." },
          autoExecute: { type: "boolean", description: "Allow auto-execution when AutoPilot is enabled." }
        }
      },
      tools: { type: "boolean", description: "Allow tool calls (shortcut)." },
      broker: { type: "boolean", description: "Allow broker actions (shortcut)." },
      trade: { type: "boolean", description: "Allow trade proposals (shortcut)." },
      autoExecute: { type: "boolean", description: "Allow auto-execution (shortcut)." },
      reason: { type: "string", description: "Why this change is needed." }
    }
  }
};

export const codebaseListTool = {
  type: "function",
  name: "codebase_list_files",
  description: "List files in the local app codebase. Always set root to the repo root (\".\").",
  parameters: {
    type: "object",
    properties: {
      root: { type: "string", description: "Repo root (use \".\")." },
      extensions: { type: "array", items: { type: "string" }, description: "Optional file extensions to include (e.g., .ts,.tsx)." },
      maxResults: { type: "number", description: "Maximum number of files to return." },
      includeAll: { type: "boolean", description: "Include all directories/extensions (no skip lists)." },
      reason: { type: "string", description: "Why the file list is needed." }
    }
  }
};

export const codebaseSearchTool = {
  type: "function",
  name: "codebase_search",
  description: "Search the local codebase for a string or regex pattern and return matching lines. Use root \".\".",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query string or regex pattern." },
      regex: { type: "boolean", description: "Treat query as a regex pattern." },
      caseSensitive: { type: "boolean", description: "Whether the search is case-sensitive." },
      contextLines: { type: "number", description: "Number of context lines to include around matches." },
      maxResults: { type: "number", description: "Maximum number of matches to return." },
      root: { type: "string", description: "Repo root (use \".\")." },
      extensions: { type: "array", items: { type: "string" }, description: "Optional file extensions to include." },
      includeAll: { type: "boolean", description: "Include all directories/extensions (no skip lists)." },
      maxFileBytes: { type: "number", description: "Maximum file size (bytes) to search." },
      maxFileResults: { type: "number", description: "Maximum files to scan." },
      reason: { type: "string", description: "Why the search is needed." }
    },
    required: ["query"]
  }
};

export const codebaseReadTool = {
  type: "function",
  name: "codebase_read_file",
  description: "Read a file (or a line range) from the local codebase. Use root \".\".",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative file path to read." },
      startLine: { type: "number", description: "Optional start line (1-based)." },
      endLine: { type: "number", description: "Optional end line (1-based)." },
      maxLines: { type: "number", description: "Optional max number of lines to return." },
      fullFile: { type: "boolean", description: "Read the entire file (may be paged)."},
      root: { type: "string", description: "Repo root (use \".\")." },
      reason: { type: "string", description: "Why the file is needed." }
    },
    required: ["path"]
  }
};

export const codebaseTraceTool = {
  type: "function",
  name: "codebase_trace_dataflow",
  description: "Trace data flow between a source and sink by locating relevant references. Use root \".\".",
  parameters: {
    type: "object",
    properties: {
      source: { type: "string", description: "Source symbol/event/endpoint to trace from." },
      sink: { type: "string", description: "Sink symbol/event/endpoint to trace to." },
      maxResults: { type: "number", description: "Maximum number of matches to return." },
      root: { type: "string", description: "Repo root (use \".\")." },
      extensions: { type: "array", items: { type: "string" }, description: "Optional file extensions to include." },
      includeAll: { type: "boolean", description: "Include all directories/extensions (no skip lists)." },
      reason: { type: "string", description: "Why the trace is needed." }
    }
  }
};

export const OPENAI_TRADING_FUNCTION_TOOLS: OpenAiTool[] = [
  systemStateTool,
  appSnapshotTool,
  actionCatalogTool,
  tradeTool,
  riskTool,
  brokerRefreshTool,
  closePositionTool,
  cancelOrderTool,
  modifyPositionTool,
  modifyOrderTool,
  nativeChartSnapshotTool,
  backtestSummaryTool,
  backtestTrainingPackTool,
  backtestOptimizationTool,
  backtestOptimizerStartTool,
  backtestOptimizerStatusTool,
  backtestOptimizerResultsTool,
  optimizerWinnerParamsTool,
  optimizerWinnerPresetTool,
  backtestOptimizerRefinementTool,
  backtestOptimizationChainTool,
  researchAutopilotStartTool,
  researchAutopilotStatusTool,
  researchAutopilotResultsTool,
  researchAutopilotStopTool,
  brokerQuoteTool,
  agentMemoryGetTool,
  agentMemoryListTool,
  setupWatcherListTool,
  setupWatcherCreateTool,
  setupWatcherUpdateTool,
  setupWatcherDeleteTool,
  setupSignalsTool,
  explainSetupSignalTool,
  setupLibraryListTool,
  setupLibraryWatcherTool,
  updateAgentCapabilitiesTool
];

export const OPENAI_LIVE_FUNCTION_TOOLS: OpenAiTool[] = OPENAI_TRADING_FUNCTION_TOOLS.filter(
  (tool) => tool.name !== 'updateAgentCapabilities'
);

export const OPENAI_TECH_FUNCTION_TOOLS: OpenAiTool[] = [
  systemStateTool,
  appSnapshotTool,
  actionCatalogTool,
  agentMemoryGetTool,
  agentMemoryListTool,
  updateAgentCapabilitiesTool,
  codebaseListTool,
  codebaseSearchTool,
  codebaseReadTool,
  codebaseTraceTool
];

export const toRealtimeTools = (tools: OpenAiTool[]) =>
  tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  }));

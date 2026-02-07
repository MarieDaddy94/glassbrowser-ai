import React from 'react';

export function shallowEqualByKeys<T extends Record<string, any>>(
  prev: T,
  next: T,
  keys: Array<keyof T>
): boolean {
  for (const key of keys) {
    if (!Object.is(prev[key], next[key])) return false;
  }
  return true;
}

export function memoByKeys<T extends Record<string, any>>(
  Component: React.ComponentType<T>,
  keys: Array<keyof T>
) {
  return React.memo(Component, (prev, next) => shallowEqualByKeys(prev as T, next as T, keys));
}

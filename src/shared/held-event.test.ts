import { describe, expect, it, vi } from 'vitest';
import { heldEvent } from './held-event';

describe('heldEvent', () => {
  it('passes events to the subscribers', () => {
    const event = heldEvent<string>();
    const listener = vi.fn();
    event.subscribe(listener);
    event.emit('a');
    expect(listener).toHaveBeenCalledWith('a');
  });

  it('keeps the last event without subscribers and gives it to the first one', () => {
    const event = heldEvent<string>();
    event.emit('a');
    event.emit('b');
    const first = vi.fn();
    const second = vi.fn();
    event.subscribe(first);
    event.subscribe(second);
    expect(first.mock.calls).toEqual([['b']]);
    expect(second).not.toHaveBeenCalled();
  });

  it('holds events again once everybody has unsubscribed', () => {
    const event = heldEvent<string>();
    const unsubscribe = event.subscribe(vi.fn());
    unsubscribe();
    event.emit('a');
    const listener = vi.fn();
    event.subscribe(listener);
    expect(listener).toHaveBeenCalledWith('a');
  });

  it('unsubscribes only the given subscription', () => {
    const event = heldEvent<string>();
    const listener = vi.fn();
    const unsubscribe = event.subscribe(listener);
    event.subscribe(listener);
    unsubscribe();
    unsubscribe();
    event.emit('a');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

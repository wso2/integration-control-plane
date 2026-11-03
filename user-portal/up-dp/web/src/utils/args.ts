/*
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com). All Rights Reserved.
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein is strictly forbidden, unless permitted by WSO2 in accordance with
 * the WSO2 Commercial License available at http://wso2.com/licenses.
 * For specific language governing the permissions and limitations under
 * this license, please see the license as well as any agreement you've
 * entered into with WSO2 governing the purchase of this software and any
 * associated services.
 */

import type { ExecutionArg, RuntimeArgument } from '../types/portal';

/** A value per runtime argument: text, a list for a repeating argument, or a flag. */
export type ArgValues = Record<string, string | string[] | boolean>;

export function argLabel(arg: RuntimeArgument): string {
  return arg.displayName || arg.name;
}

export function initialArgValues(args: RuntimeArgument[]): ArgValues {
  return Object.fromEntries(args.map((arg) => [arg.name, arg.type === 'boolean' ? false : arg.repeat ? [] : '']));
}

export function missingRequired(args: RuntimeArgument[], values: ArgValues): string[] {
  return args
    .filter((arg) => arg.required && arg.type !== 'boolean')
    .filter((arg) => {
      const value = values[arg.name];
      return Array.isArray(value) ? value.every((v) => !v.trim()) : !String(value ?? '').trim();
    })
    .map((arg) => arg.name);
}

export function invalidNumbers(args: RuntimeArgument[], values: ArgValues): string[] {
  const numeric = (type: string) => ['int', 'float', 'decimal'].includes(type);
  return args
    .filter((arg) => numeric(arg.type))
    .filter((arg) => {
      const raw = String(values[arg.name] ?? '').trim();
      return raw !== '' && (arg.type === 'int' ? !/^-?\d+$/.test(raw) : Number.isNaN(Number(raw)));
    })
    .map((arg) => arg.name);
}

/**
 * The trigger body: one entry per value, a checked flag as "true", unchecked flags and blanks left
 * out. iPaaS-Service adds each argument's prefix and delimiter when it builds the command line.
 */
export function toExecutionArgs(args: RuntimeArgument[], values: ArgValues): ExecutionArg[] {
  return args.flatMap((arg) => {
    const value = values[arg.name];
    if (arg.type === 'boolean') return value === true ? [{ name: arg.name, value: 'true' }] : [];
    const list = Array.isArray(value) ? value : [String(value ?? '')];
    return list.map((v) => v.trim()).filter(Boolean).map((v) => ({ name: arg.name, value: v }));
  });
}

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

import { Alert, Box, Button, Chip, CircularProgress, Drawer, FormControlLabel, FormLabel, IconButton, MenuItem, Radio, RadioGroup, Stack, Switch, Typography } from '@wso2/oxygen-ui';
import { Plus, X } from '@wso2/oxygen-ui-icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RuntimeArgument } from '../../types/portal';
import { argLabel, initialArgValues, invalidNumbers, missingRequired, type ArgValues } from '../../utils/args';
import TextField from '../common/TextField';

const drawerSx = { '& .MuiDrawer-paper': { width: { xs: '100%', sm: 480 }, display: 'flex', flexDirection: 'column' } } as const;

function RepeatInput({ arg, values, onChange, error }: { arg: RuntimeArgument; values: string[]; onChange: (v: string[]) => void; error?: string }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft('');
  };
  return (
    <Stack gap={1}>
      <TextField
        label={argLabel(arg)}
        required={arg.required}
        size="small"
        fullWidth
        value={draft}
        placeholder={t('automation.runDrawer.addValuePlaceholder')}
        error={!!error}
        helperText={error ?? arg.description}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add();
          }
        }}
        slotProps={{
          input: {
            endAdornment: (
              <IconButton size="small" aria-label={t('automation.runDrawer.addValue')} onClick={add} disabled={!draft.trim()}>
                <Plus size={16} />
              </IconButton>
            ),
          },
        }}
      />
      {values.length > 0 && (
        <Stack direction="row" gap={0.75} flexWrap="wrap">
          {values.map((v) => (
            <Chip key={v} label={v} size="small" onDelete={() => onChange(values.filter((x) => x !== v))} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function ArgInput({ arg, value, onChange, error }: { arg: RuntimeArgument; value: ArgValues[string]; onChange: (v: ArgValues[string]) => void; error?: string }) {
  const { t } = useTranslation();
  if (arg.type === 'boolean')
    return (
      <Box>
        <FormControlLabel control={<Switch checked={value === true} onChange={(e) => onChange(e.target.checked)} />} label={argLabel(arg)} />
        {arg.description && (
          <Typography variant="caption" color="text.secondary" component="div">
            {arg.description}
          </Typography>
        )}
      </Box>
    );
  if (arg.repeat) return <RepeatInput arg={arg} values={Array.isArray(value) ? value : []} onChange={onChange} error={error} />;
  if (arg.values?.length && arg.values.length <= 3)
    return (
      <Box>
        <FormLabel required={arg.required}>{argLabel(arg)}</FormLabel>
        <RadioGroup row value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
          {arg.values.map((v) => (
            <FormControlLabel key={v} value={v} control={<Radio size="small" />} label={v} />
          ))}
        </RadioGroup>
        <Typography variant="caption" color={error ? 'error' : 'text.secondary'}>
          {error ?? arg.description}
        </Typography>
      </Box>
    );
  if (arg.values?.length)
    return (
      <TextField label={argLabel(arg)} required={arg.required} select size="small" fullWidth value={String(value ?? '')} error={!!error} helperText={error ?? arg.description} onChange={(e) => onChange(e.target.value)}>
        {!arg.required && (
          <MenuItem value="">
            <em>{t('automation.runDrawer.none')}</em>
          </MenuItem>
        )}
        {arg.values.map((v) => (
          <MenuItem key={v} value={v}>
            {v}
          </MenuItem>
        ))}
      </TextField>
    );
  const numeric = ['int', 'float', 'decimal'].includes(arg.type);
  return (
    <TextField
      label={argLabel(arg)}
      required={arg.required}
      size="small"
      fullWidth
      type={numeric ? 'number' : 'text'}
      value={String(value ?? '')}
      error={!!error}
      helperText={error ?? arg.description}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** The run form, as the console's runtime-arguments drawer: one field per argument the automation declares. */
export default function RunDrawer({ name, args, busy, error, onRun, onClose }: { name: string; args: RuntimeArgument[]; busy: boolean; error: string | null; onRun: (values: ArgValues) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [values, setValues] = useState<ArgValues>(() => initialArgValues(args));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const run = () => {
    const found: Record<string, string> = {};
    missingRequired(args, values).forEach((n) => (found[n] = t('automation.runDrawer.required')));
    invalidNumbers(args, values).forEach((n) => (found[n] = t('automation.runDrawer.enterNumber')));
    setErrors(found);
    if (!Object.keys(found).length) onRun(values);
  };

  return (
    <Drawer anchor="right" open onClose={onClose} sx={drawerSx}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5">{t('automation.runDrawer.title', { name })}</Typography>
          <Typography variant="caption" color="text.secondary">
            {t('automation.runDrawer.subtitle')}
          </Typography>
        </Box>
        <IconButton size="small" aria-label={t('common.actions.close')} onClick={onClose}>
          <X size={16} />
        </IconButton>
      </Stack>
      <Stack gap={2.5} sx={{ flex: 1, overflow: 'auto', px: 3, py: 2.5 }}>
        {args.map((arg) => (
          <ArgInput key={arg.name} arg={arg} value={values[arg.name]} error={errors[arg.name]} onChange={(v) => setValues((all) => ({ ...all, [arg.name]: v }))} />
        ))}
        {error && <Alert severity="error">{error}</Alert>}
      </Stack>
      <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ px: 3, py: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
        <Button onClick={() => setValues(initialArgValues(args))} disabled={busy} sx={{ mr: 'auto' }}>
          {t('automation.runDrawer.clear')}
        </Button>
        <Button onClick={onClose} disabled={busy}>
          {t('common.actions.cancel')}
        </Button>
        <Button variant="contained" onClick={run} disabled={busy} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {busy ? t('automation.runDrawer.starting') : t('common.actions.run')}
        </Button>
      </Stack>
    </Drawer>
  );
}

/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { Box, ComplexSelect, Tooltip } from '@wso2/oxygen-ui';
import { useState, type JSX, type KeyboardEvent, type Ref } from 'react';
import { OrganizationList, canSwitchOrganization, useAuth, type OrganizationSwitchState } from '../auth';

interface OrganizationSwitcherProps {
  /** The card's element, which the header's project menu anchors to. */
  ref?: Ref<HTMLDivElement>;
  /** The organization in the URL. */
  org: string;
  /** Its display name. */
  name: string;
  /** Opens the organization's overview. */
  onHome: () => void;
}

// Matches the Project/Integration cards.
const cardSx = { position: 'relative', display: 'inline-flex', alignSelf: 'center', ml: 1 } as const;
const homeCardSx = {
  ...cardSx,
  cursor: 'pointer',
  borderRadius: 1,
  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
} as const;
const selectSx = { minWidth: 180, maxWidth: 220, '& .MuiListItemText-root': { minWidth: 0, overflow: 'hidden' } } as const;
const selectDisplayProps = { 'aria-label': 'Select organization' };
// The card's select only draws the card: not a tab stop, and hidden from assistive technology, which
// reads the card's own label instead.
const decorativeDisplayProps = { tabIndex: -1 };

function OrganizationText({ name }: { name: string }): JSX.Element {
  return <ComplexSelect.MenuItem.Text primary={name} secondary="Organization" primaryTypographyProps={{ noWrap: true, title: name }} />;
}

/**
 * The organization alone, as a card that opens its overview. The card is the one control: the select
 * inside only matches the look of the Project and Integration cards.
 */
function OrganizationCard({ ref, org, name, onHome }: OrganizationSwitcherProps): JSX.Element {
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onHome();
    }
  };
  return (
    <Box ref={ref} role="button" tabIndex={0} aria-label={`Open ${name} overview`} sx={homeCardSx} onClick={onHome} onKeyDown={onKeyDown}>
      <Box aria-hidden display="contents">
        <ComplexSelect value={org} open={false} onChange={() => {}} onOpen={() => {}} size="small" sx={selectSx} IconComponent={() => null} SelectDisplayProps={decorativeDisplayProps} renderValue={() => <OrganizationText name={name} />} label="Organization">
          <ComplexSelect.MenuItem value={org}>
            <OrganizationText name={name} />
          </ComplexSelect.MenuItem>
        </ComplexSelect>
      </Box>
    </Box>
  );
}

/**
 * The user's organizations. Picking another one switches the session to it; picking the current one
 * opens its overview, as the card does.
 */
function OrganizationSelect({ ref, org, name, onHome, organizationUnits, error, switchingId, onSwitch }: OrganizationSwitcherProps & OrganizationSwitchState): JSX.Element {
  // The failure the user has already seen: opening the select again hides it.
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const current = organizationUnits.find((unit) => unit.handle === org);

  // Until the list arrives, or with nowhere else to go, the organization stays a card.
  if (!current || organizationUnits.length < 2) return <OrganizationCard ref={ref} org={org} name={name} onHome={onHome} />;

  const shownError = error !== null && error !== dismissedError ? error : null;
  // While switching, the chosen organization shows, disabled, until the console reloads in it.
  const shown = organizationUnits.find((unit) => unit.id === switchingId) ?? current;

  return (
    <Box ref={ref} sx={cardSx}>
      <Tooltip title={shownError ?? ''} open={shownError !== null} placement="bottom-start" arrow>
        <ComplexSelect
          value={shown.id}
          size="small"
          sx={selectSx}
          disabled={switchingId !== null}
          error={shownError !== null}
          onOpen={() => setDismissedError(error)}
          onChange={(event) => {
            const unit = organizationUnits.find((candidate) => candidate.id === event.target.value);
            if (unit && unit.id !== current.id && switchingId === null) onSwitch(unit, current.id);
          }}
          SelectDisplayProps={selectDisplayProps}
          renderValue={() => <OrganizationText name={shown.id === current.id ? name : shown.name} />}
          label="Organization">
          {organizationUnits.map((unit) => (
            <ComplexSelect.MenuItem key={unit.id} value={unit.id} onClick={unit.id === current.id ? onHome : undefined}>
              <ComplexSelect.MenuItem.Text primary={unit.name} secondary={unit.handle} primaryTypographyProps={{ noWrap: true, title: unit.name }} />
            </ComplexSelect.MenuItem>
          ))}
        </ComplexSelect>
      </Tooltip>
    </Box>
  );
}

/**
 * The header's organization card. With ORGANIZATION_SWITCHER on the gateway, it lists the organizations
 * the user belongs to and switches the console to the one picked; otherwise, or with one organization,
 * it shows the organization alone.
 */
export default function OrganizationSwitcher(props: OrganizationSwitcherProps): JSX.Element {
  const { orgHandle: sessionOrg } = useAuth();
  // A switch moves the session, so it is offered from the session's own organization only. A link to
  // another organization shows "no access" with its own way back.
  if (!canSwitchOrganization() || props.org !== sessionOrg) return <OrganizationCard {...props} />;
  return <OrganizationList>{(state) => <OrganizationSelect {...props} {...state} />}</OrganizationList>;
}

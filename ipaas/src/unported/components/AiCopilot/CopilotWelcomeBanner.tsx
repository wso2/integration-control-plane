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

import { Autocomplete, Box, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import TextField from '../../../components/common/TextField';
import { useContext } from 'react';
import type { JSX } from 'react';
import AIWelcomeIcon from '../../assets/icons/ai/AIWelcomeIcon';
import { CopilotContext } from '../../contexts/CopilotContext';
import type { CopilotRegion } from '../../../types/copilot';

export default function CopilotWelcomeBanner(): JSX.Element {
  const { selectedRegion, setSelectedRegion, isMultiRegionAvailable, availableRegions } = useContext(CopilotContext);

  const handleRegionChange = (_: unknown, region: CopilotRegion | null) => {
    if (region?.copilot_accessible && !region.disconnected) {
      setSelectedRegion(region);
    } else {
      setSelectedRegion(null);
    }
  };

  const bannerText = isMultiRegionAvailable ? 'Need help with WSO2 Integration Platform? Select your region to continue.' : 'Need help with WSO2 Integration Platform? Ask here for assistance.';

  return (
    <Stack alignItems="center" gap={1} sx={{ flexGrow: 1, justifyContent: 'center', mb: 2 }}>
      <Box sx={{ fontSize: 120, display: 'flex', alignItems: 'center' }}>
        <AIWelcomeIcon width={100} height={100} />
      </Box>
      <Typography variant="h5" fontWeight={600}>
        Hi, Welcome to Copilot!
      </Typography>
      <Typography variant="body2" textAlign="center">
        {bannerText}
      </Typography>
      {isMultiRegionAvailable && (
        <Box sx={{ width: 200 }}>
          <Autocomplete
            value={selectedRegion}
            onChange={handleRegionChange}
            options={availableRegions}
            getOptionLabel={(option) => (option.copilot_accessible && !option.disconnected ? option.name : '')}
            getOptionDisabled={(option) => !option.copilot_accessible || option.disconnected}
            renderOption={(props, option) => {
              const isDisabled = !option.copilot_accessible || option.disconnected;
              const tooltipTitle = option.disconnected ? 'Region is disconnected' : 'Copilot is disabled for this region.';
              const optionEl = (
                <Box component="li" {...props}>
                  <Typography variant="body2">{option.name}</Typography>
                </Box>
              );
              return isDisabled ? (
                <Tooltip title={tooltipTitle} placement="right" key={option.id}>
                  <span>{optionEl}</span>
                </Tooltip>
              ) : (
                optionEl
              );
            }}
            renderInput={(params) => <TextField {...params} size="small" placeholder="Select Region" />}
            size="small"
          />
        </Box>
      )}
    </Stack>
  );
}

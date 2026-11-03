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

import { Box, Card, CardContent, Link, Stack, Typography } from '@wso2/oxygen-ui';
import { ArrowRight, BookOpen, FileText, LifeBuoy } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { EXPLORE_GROUPS } from '../constants/exploreLinks';
import { cardContentSx, gridSx, groupHeaderSx, groupIconSx, groupSx, groupTitleSx, headingSx, linkArrowSx, linkSx, sectionSx } from './ExploreMore.styles';

const GROUP_ICONS: Record<string, JSX.Element> = {
  Tutorials: <BookOpen size={22} />,
  References: <FileText size={22} />,
  Support: <LifeBuoy size={22} />,
};

/** Documentation and support entry points, shown under the org's project list. */
export default function ExploreMore(): JSX.Element {
  return (
    <Box sx={sectionSx}>
      <Typography variant="h5" component="h2" sx={headingSx}>
        Explore more
      </Typography>
      <Card>
        <CardContent sx={cardContentSx}>
          <Box sx={gridSx}>
            {EXPLORE_GROUPS.map((group) => (
              // Links start at the icon's left edge, so each arrow lines up under the group icon.
              <Box key={group.title} sx={groupSx}>
                <Stack direction="row" gap={1.5} alignItems="center" sx={groupHeaderSx}>
                  <Box sx={groupIconSx}>{GROUP_ICONS[group.title]}</Box>
                  <Typography variant="body1" sx={groupTitleSx}>
                    {group.title}
                  </Typography>
                </Stack>
                <Stack gap={0.75}>
                  {group.links.map((link) => (
                    <Link key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" variant="body2" underline="hover" sx={linkSx}>
                      <Box component="span" sx={linkArrowSx}>
                        <ArrowRight size={14} />
                      </Box>
                      {link.label}
                    </Link>
                  ))}
                </Stack>
              </Box>
            ))}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

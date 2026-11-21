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

import { Alert, Box, Card, CardContent, Link, Stack, Typography } from '@wso2/oxygen-ui';
import { Fragment, type JSX } from 'react';
import type { ReviewSection, ReviewSectionId } from '../../../utils/knowledgeBase';
import { reviewGridSx, stepHeadingSx } from '../styles';

interface KnowledgeBaseReviewProps {
  sections: ReviewSection[];
  /** Go back to the step a section was set on. */
  onEdit: (section: ReviewSectionId) => void;
  /** The step heading; left out where the surrounding dialog already titles the review. */
  heading?: string;
}

/** What the create wizard is about to create, a card per step with a way back to it. */
export default function KnowledgeBaseReview({ sections, onEdit, heading }: KnowledgeBaseReviewProps): JSX.Element {
  return (
    <>
      {heading && (
        <Typography variant="subtitle2" sx={stepHeadingSx}>
          {heading}
        </Typography>
      )}
      <Stack gap={2}>
        <Alert severity="info">Creating a knowledge base also creates its KB Service, which serves retrieval for it.</Alert>
        {sections.map((section) => (
          <Card key={section.id} variant="outlined">
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                <Typography variant="subtitle2">{section.title}</Typography>
                <Link component="button" variant="body2" underline="hover" onClick={() => onEdit(section.id)} aria-label={`Edit ${section.title.toLowerCase()}`}>
                  Edit
                </Link>
              </Stack>
              <Box sx={reviewGridSx}>
                {section.rows.map((row) => (
                  <Fragment key={row.label}>
                    <Typography variant="body2" color="text.secondary">
                      {row.label}
                    </Typography>
                    <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                      {row.value}
                    </Typography>
                  </Fragment>
                ))}
              </Box>
            </CardContent>
          </Card>
        ))}
      </Stack>
    </>
  );
}

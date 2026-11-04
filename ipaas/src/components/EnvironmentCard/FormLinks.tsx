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

import type { ResourceLink } from '../../types/configuration';
import { BuildChangeLink } from '../Build/LinkWarnings';
import { LinkRows } from './LinkRows';
import { LinkSuggestions } from './LinkSuggestions';

interface FormLinksProps {
  projectId: string;
  componentId: string;
  env: string;
  open: boolean;
  links: ResourceLink[];
  /** The build env runs: Change link where it lacks a link's connection. */
  build?: string;
}

/** A Configure form's links: Change link where env's build lacks a link's connection, each link as env gets it, and suggestions. */
export function FormLinks({ projectId, componentId, env, open, links, build }: FormLinksProps) {
  return (
    <>
      {open && build && <BuildChangeLink projectId={projectId} componentId={componentId} build={build} />}
      <LinkRows projectId={projectId} componentId={componentId} env={env} links={links} />
      <LinkSuggestions projectId={projectId} componentId={componentId} open={open} links={links} actions={['Link', 'Link through']} />
    </>
  );
}

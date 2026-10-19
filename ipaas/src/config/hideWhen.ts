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

import { createElement, type FC } from 'react';
import { useParams } from 'react-router';
import HiddenPageRedirect from '../components/HiddenPageRedirect';

type Preloadable = { preload?: () => Promise<unknown> };

/**
 * Renders `Page` unless `isHidden()` is true, in which case its URL bounces to the
 * level's home like a retired page. Checked at render, because the route table is
 * built before /config.json loads.
 */
export function hideWhen<P extends object>(Page: FC<P>, isHidden: () => boolean): FC<P> {
  function HideablePage(props: P) {
    const { projectHandler } = useParams();
    if (isHidden()) return createElement(HiddenPageRedirect, { level: projectHandler ? 'projects' : 'organizations' });
    return createElement(Page, props);
  }
  // Keeps the lazy page's `preload` visible to the navigation preloader, as withScope does.
  (HideablePage as FC<P> & Preloadable).preload = (Page as FC<P> & Preloadable).preload;
  return HideablePage;
}

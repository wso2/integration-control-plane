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

import { Box } from '@wso2/oxygen-ui';
import { BookOpen, Building2, Cloud, Code, CreditCard, Database, FileText, Folder, GitHub, Globe, Hash, Headset, Kanban, Mail, MessageSquare, Package, Plug, Rss, ShieldCheck, ShoppingCart, Table, Upload, Video } from '@wso2/oxygen-ui-icons-react';
import type { ComponentType, JSX, ReactNode } from 'react';
import { CONNECTOR_BY_ID, contextLogoUrl } from '../../constants/contextEngine';
import { sourceMarkSx, sourceTileMarkSx } from './styles';
import type { SourceIcon } from '../../types/contextEngine';

const ICONS: Record<SourceIcon, ComponentType<{ size?: number }>> = {
  book: BookOpen,
  building: Building2,
  github: GitHub,
  globe: Globe,
  upload: Upload,
  database: Database,
  headset: Headset,
  hash: Hash,
  kanban: Kanban,
  file: FileText,
  cloud: Cloud,
  folder: Folder,
  mail: Mail,
  table: Table,
  chat: MessageSquare,
  box: Package,
  plug: Plug,
  shield: ShieldCheck,
  video: Video,
  rss: Rss,
  cart: ShoppingCart,
  card: CreditCard,
  code: Code,
};

/** Icon for a connector id; ids the catalog no longer has fall back to a folder. */
// eslint-disable-next-line react-refresh/only-export-components
export function sourceTypeIcon(type: string, size = 20): ReactNode {
  const Icon = ICONS[CONNECTOR_BY_ID[type]?.icon ?? 'folder'];
  return <Icon size={size} />;
}

interface SourceMarkProps {
  /** Connector id. */
  type: string;
  /** Glyph size in px. */
  size?: number;
  /** `tile` wraps the mark in a 36px tinted square for rows and cards; `plain` is just the glyph. */
  variant?: 'plain' | 'tile';
}

/** A connector's brand logo, or its icon when there is no logo. */
export default function SourceMark({ type, size = 20, variant = 'plain' }: SourceMarkProps): JSX.Element {
  const logo = CONNECTOR_BY_ID[type]?.logo;
  const glyph = logo ? <Box component="img" src={contextLogoUrl(logo)} alt="" sx={{ height: size, display: 'block' }} /> : sourceTypeIcon(type, size);
  return <Box sx={variant === 'tile' ? sourceTileMarkSx : sourceMarkSx}>{glyph}</Box>;
}

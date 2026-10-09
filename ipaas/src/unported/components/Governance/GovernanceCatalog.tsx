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

import { Grid, Stack, TablePagination, Typography } from '@wso2/oxygen-ui';
import { useMemo, useState, type JSX, type ReactNode } from 'react';

interface GovernanceCatalogProps<T extends { id?: string }> {
  items: T[];
  renderCard: (item: T) => ReactNode;
  emptyMessage: string;
  itemsPerPageLabel: string;
}

export default function GovernanceCatalog<T extends { id?: string }>({ items, renderCard, emptyMessage, itemsPerPageLabel }: GovernanceCatalogProps<T>): JSX.Element {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(4);

  // Filtering can shrink the list below the current page; clamp instead of showing an empty page.
  const maxPage = Math.max(0, Math.ceil(items.length / rowsPerPage) - 1);
  const safePage = Math.min(page, maxPage);

  const paginatedItems = useMemo(() => {
    const start = safePage * rowsPerPage;
    return items.slice(start, start + rowsPerPage);
  }, [items, safePage, rowsPerPage]);

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  if (!items.length) {
    return (
      <Typography color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>
        {emptyMessage}
      </Typography>
    );
  }

  return (
    <Stack gap={2}>
      <Grid container spacing={2}>
        {paginatedItems.map((item) => (
          <Grid key={item.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
            {renderCard(item)}
          </Grid>
        ))}
      </Grid>

      <Stack direction="row" justifyContent="flex-end" alignItems="center">
        <TablePagination
          component="div"
          count={items.length}
          page={safePage}
          onPageChange={handleChangePage}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          rowsPerPageOptions={[4, 10, 25]}
          showFirstButton
          showLastButton
          labelRowsPerPage={itemsPerPageLabel}
        />
      </Stack>
    </Stack>
  );
}

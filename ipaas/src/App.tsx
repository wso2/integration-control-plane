/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com).
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

import { Suspense, type JSX } from 'react';
import { Route, Routes } from 'react-router';
import routes, { type AppRoute } from './config/routes';
import NavigationProgress from './components/NavigationProgress';
import { usePageViewTracking } from './hooks/useConsoleAnalytics';
import { setConsoleRoutes } from './services/telemetry/consoleActions';
import './App.css';

// Before the first render, so actions reported from the first page's mount effects already name their route.
setConsoleRoutes(routes);

function renderRoutes(routeList: AppRoute[]): JSX.Element[] {
  return routeList.map((route, i) => {
    if (route.index) {
      return <Route key={`index-${i}`} index element={route.element} />;
    }
    return (
      <Route key={route.path ?? `layout-${i}`} path={route.path} element={route.element}>
        {route.children && renderRoutes(route.children)}
      </Route>
    );
  });
}

function App() {
  usePageViewTracking(routes);
  return (
    <>
      <NavigationProgress />
      <Suspense fallback={null}>
        <Routes>{renderRoutes(routes)}</Routes>
      </Suspense>
    </>
  );
}

export default App;

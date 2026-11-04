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

import { Box, Link, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { external, loginUrl, privacyPolicyUrl } from '../paths';

export default function CookiePolicy(): JSX.Element {
  const navigate = useAppNavigate();
  const handleBack = () => (window.history.length > 1 ? navigate(-1) : navigate(loginUrl()));

  return (
    <Box sx={{ position: 'fixed', inset: 0, overflowY: 'auto', zIndex: 1 }}>
      <Link component="button" onClick={handleBack} sx={{ position: 'fixed', top: '5rem', left: '1.5rem', zIndex: 2, display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
        <ArrowLeft size={16} />
        Back
      </Link>
      <Box sx={{ maxWidth: 800, mx: 'auto', px: 4, py: 6 }}>
        <Typography variant="h1" gutterBottom>
          WSO2 Integration Platform - Cookie Policy
        </Typography>
        <Link href={external.wso2} target="_blank" rel="noopener noreferrer" color="primary" sx={{ textDecoration: 'underline' }}>
          WSO2 Integration Platform
        </Link>
        <Typography variant="body1" sx={{ mt: 1, mb: 4 }}>
          WSO2 Integration Platform monitors running Micro Integrator instances (Single or Cluster Mode) and facilitates performing various management and administration tasks related to deployed artifacts.
        </Typography>

        <Stack spacing={3}>
          <section>
            <Typography variant="h3" component="h2" gutterBottom>
              Cookie Policy
            </Typography>
            <Typography variant="body1">
              WSO2 Integration Platform uses cookies so that it can provide the best user experience for you and identify you for security purposes. If you disable cookies, some of the services will be inaccessible to you.
            </Typography>
          </section>

          <section>
            <Typography variant="h3" component="h2" gutterBottom>
              How does WSO2 Integration Platform process cookies?
            </Typography>
            <Typography variant="body1" paragraph>
              WSO2 Integration Platform stores and retrieves information on your browser using cookies. This information is used to provide a better experience. Some cookies serve the primary purposes of allowing a user to log in to the system, maintaining
              sessions, and keeping track of activities you do within the login session.
            </Typography>
            <Typography variant="body1" paragraph>
              The primary purpose of some cookies used in WSO2 Integration Platform is to personally identify you. However the cookie lifetime ends once your session ends i.e., after you log-out, or after the session expiry time has elapsed.
            </Typography>
            <Typography variant="body1" paragraph>
              Some cookies are simply used to give you a more personalized web experience and these cookies can not be used to personally identify you or your activities.
            </Typography>
            <Typography variant="body1">
              This cookie policy is part of the{' '}
              <Link href={privacyPolicyUrl()} target="_blank" rel="noopener noreferrer" sx={{ textDecoration: 'underline' }}>
                WSO2 Integration Platform Privacy Policy.
              </Link>
            </Typography>
          </section>

          <section>
            <Typography variant="h3" component="h2" gutterBottom>
              What is a cookie?
            </Typography>
            <Typography variant="body1">
              A browser cookie is a small piece of data that is stored on your device to help websites and mobile apps remember things about you. Other technologies, including web storage and identifiers associated with your device, may be used for similar
              purposes. In this policy, we use the term &quot;cookies&quot; to discuss all of these technologies.
            </Typography>
          </section>

          <section>
            <Typography variant="h3" component="h2" gutterBottom>
              What does WSO2 Integration Platform use cookies for?
            </Typography>
            <Typography variant="body1" paragraph>
              Cookies are used for two purposes in WSO2 Integration Platform.
            </Typography>
            <ol style={{ margin: 0, paddingLeft: '2rem' }}>
              <li>
                <Typography variant="body1">To identify you and provide security (as this is the main function of WSO2 Integration Platform).</Typography>
              </li>
              <li>
                <Typography variant="body1">To provide a satisfying user experience.</Typography>
              </li>
            </ol>
            <Typography variant="body1" paragraph sx={{ mt: 2 }}>
              WSO2 Integration Platform uses cookies for the following purposes listed below.
            </Typography>
            <Typography variant="h4" component="h3" gutterBottom>
              Preferences
            </Typography>
            <Typography variant="body1" paragraph>
              WSO2 Integration Platform uses these cookies to remember your settings and preferences, and to auto-fill the form fields to make your interactions with the site easier.
            </Typography>
            <Typography variant="body1" paragraph>
              These cookies can not be used to personally identify you.
            </Typography>
            <Typography variant="h4" component="h3" gutterBottom>
              Security
            </Typography>
            <Typography variant="body1" paragraph>
              WSO2 Integration Platform uses selected cookies to identify and prevent security risks. For example, WSO2 Integration Platform may use these cookies to store your session information in order to prevent others from changing your password without
              your username and password.
            </Typography>
            <Typography variant="body1" paragraph>
              WSO2 Integration Platform uses session cookies to maintain your active session.
            </Typography>
            <Typography variant="body1" paragraph>
              WSO2 Integration Platform may use temporary cookies when performing multi-factor authentication and federated authentication.
            </Typography>
            <Typography variant="body1" paragraph>
              WSO2 Integration Platform may use permanent cookies to detect that you have previously used the same device to log in. This is to calculate the &quot;risk level&quot; associated with your current login attempt. This is primarily to protect you
              and your account from possible attack.
            </Typography>
            <Typography variant="h4" component="h3" gutterBottom>
              Performance
            </Typography>
            <Typography variant="body1" paragraph>
              WSO2 Integration Platform may use cookies to allow &quot;Remember Me&quot; functionalities.
            </Typography>
            <Typography variant="h4" component="h3" gutterBottom>
              Analytics
            </Typography>
            <Typography variant="body1">WSO2 Integration Platform as a product does not use cookies for analytical purposes.</Typography>
          </section>

          <section>
            <Typography variant="h3" component="h2" gutterBottom>
              What type of cookies does WSO2 Integration Platform use?
            </Typography>
            <Typography variant="body1" paragraph>
              WSO2 Integration Platform uses persistent cookies and session cookies. A persistent cookie helps WSO2 Integration Platform to recognize you as an existing user so that it is easier to return to WSO2 or interact with WSO2 IS without signing in
              again. After you sign in, a persistent cookie stays in your browser and will be read by WSO2 Integration Platform when you return to WSO2 Integration Platform.
            </Typography>
            <Typography variant="body1">
              A session cookie is a cookie that is erased when the user closes the web browser. The session cookie is stored in temporary memory and is not retained after the browser is closed. Session cookies do not collect information from the user&apos;s
              computer.
            </Typography>
          </section>

          <section>
            <Typography variant="h3" component="h2" gutterBottom>
              How do I control my cookies?
            </Typography>
            <Typography variant="body1" paragraph>
              Most browsers allow you to control cookies through their settings preferences. However, if you limit the given ability for websites to set cookies, you may worsen your overall user experience since it will no longer be personalized to you. It may
              also stop you from saving customized settings like login information.
            </Typography>
            <Typography variant="body1">Most likely, disabling cookies will make you unable to use authentication and authorization functionalities in WSO2 Integration Platform.</Typography>
          </section>

          <section>
            <Typography variant="h3" component="h2" gutterBottom>
              What are the cookies used?
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 'bold' }}>Cookie name</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Purpose</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Retention</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TableRow>
                    <TableCell>SESSION_USER_COOKIE</TableCell>
                    <TableCell>To keep the information of the logged in user.</TableCell>
                    <TableCell>Session</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>JWT_TOKEN_COOKIE</TableCell>
                    <TableCell>To keep the security token of the active session.</TableCell>
                    <TableCell>Session</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </section>

          <section>
            <Typography variant="h3" component="h2" gutterBottom>
              Disclaimer
            </Typography>
            <Typography variant="body1" paragraph>
              This cookie policy is only for the illustrative purposes of the product WSO2 Integration Platform. The content in the policy is technically correct at the time of the product shipment. The organization which runs this WSO2 Integration Platform
              instance has full authority and responsibility with regard to the effective Cookie Policy.
            </Typography>
            <Typography variant="body1">
              WSO2, its employees, partners, and affiliates do not have access to and do not require, store, process or control any of the data, including personal data contained in WSO2 Integration Platform. All data, including personal data is controlled and
              processed by the entity or individual running the dashboard. WSO2, its employees, partners and affiliates are not a data processor or a data controller within the meaning of any data privacy regulations. WSO2 does not provide any warranties or
              undertake any responsibility or liability in connection with the lawfulness or the manner and purposes for which WSO2 Integration Platform is used by such entities or persons.
            </Typography>
          </section>
        </Stack>
      </Box>
    </Box>
  );
}

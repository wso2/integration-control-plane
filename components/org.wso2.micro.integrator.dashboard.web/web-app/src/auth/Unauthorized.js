/*
 * Copyright (c) 2026, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
 *
 * WSO2 Inc. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import React from 'react';
import {Helmet} from 'react-helmet';
import {useAuthContext} from '@asgardeo/auth-react';
import {makeStyles} from '@material-ui/core/styles';
import Button from '@material-ui/core/Button';
import Container from '@material-ui/core/Container';
import CssBaseline from '@material-ui/core/CssBaseline';
import Typography from '@material-ui/core/Typography';
import Box from '@material-ui/core/Box';
import AuthManager from './AuthManager';

const useStyles = makeStyles(theme => ({
    paper: {
        marginTop: theme.spacing(12),
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
    },
    message: {
        marginTop: theme.spacing(2),
    },
    action: {
        marginTop: theme.spacing(4),
    },
}));

export default function Unauthorized() {
    const classes = useStyles();
    const {signOut} = useAuthContext();

    const handleSignOut = () => {
        AuthManager.discardSession();
        Promise.resolve(signOut()).catch(() => {
            window.location.href = (window.contextPath || '') + '/login';
        });
    };

    return (
        <Container component="main" maxWidth="sm">
            <Helmet>
                <title>Unauthorized - Integration Control Plane</title>
            </Helmet>
            <CssBaseline />
            <div className={classes.paper}>
                <img alt="WSO2 Integration Control Plane" src="/logo-inverse.svg" width={200}/>
                <Box mt={4}>
                    <Typography component="h1" variant="h4">Unauthorized</Typography>
                </Box>
                <Typography className={classes.message} variant="body1">
                    Your account is not permitted to access Integration Control Plane.
                    Please contact your administrator.
                </Typography>
                <Button
                    className={classes.action}
                    variant="contained"
                    color="primary"
                    onClick={handleSignOut}
                >
                    Sign out
                </Button>
            </div>
        </Container>
    );
}

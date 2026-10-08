@echo off
REM ---------------------------------------------------------------------------
REM Copyright (c) 2026, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
REM
REM WSO2 Inc. licenses this file to you under the Apache License,
REM Version 2.0 (the "License"); you may not use this file except
REM in compliance with the License.
REM You may obtain a copy of the License at
REM
REM      http://www.apache.org/licenses/LICENSE-2.0
REM
REM Unless required by applicable law or agreed to in writing,
REM software distributed under the License is distributed on an
REM "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
REM KIND, either express or implied.  See the License for the
REM specific language governing permissions and limitations
REM under the License.
REM ---------------------------------------------------------------------------
REM Cipher Tool script for encrypting secrets used in WSO2 Integration Control Plane
REM
REM Environment Variable Prerequisites
REM
REM   ICP_HOME      Must point at your ICP directory. If not set, it will be
REM                 derived from the script's location.
REM
REM   JAVA_HOME     Must point at your Java Development Kit installation.
REM
REM   JAVA_OPTS     (Optional) Java runtime options
REM
REM Usage:
REM   ciphertool.bat -Dconfigure   Encrypt the [plain-text] values in the top-level
REM                                [secrets] table of conf\deployment.toml
REM   ciphertool.bat               Prompt for a single value and print it encrypted
REM   ciphertool.bat -help         Show all options
REM ---------------------------------------------------------------------------

REM Make sure prerequisite environment variables are set
if not "%JAVA_HOME%" == "" goto gotJavaHome
echo The JAVA_HOME environment variable is not defined
echo This environment variable is needed to run this program
goto end

:gotJavaHome
if not exist "%JAVA_HOME%\bin\java.exe" goto noJavaHome
goto okJavaHome

:noJavaHome
echo The JAVA_HOME environment variable is not defined correctly
echo This environment variable is needed to run this program
echo NB: JAVA_HOME should point to a JDK/JRE
goto end

:okJavaHome
REM Set the current directory and ICP_HOME
set CURRENT_DIR=%cd%

if not "%ICP_HOME%" == "" goto gotHome

REM Derive ICP_HOME from the script's location (one level up from bin)
set ICP_HOME=%~sdp0..
if exist "%ICP_HOME%\bin\ciphertool.bat" goto okHome

REM Try the current directory
cd ..
set ICP_HOME=%cd%
cd %ICP_HOME%

:gotHome
if exist "%ICP_HOME%\bin\ciphertool.bat" goto okHome

set ICP_HOME=%CURRENT_DIR%
if exist "%ICP_HOME%\bin\ciphertool.bat" goto okHome

echo The ICP_HOME environment variable is not defined correctly
echo This environment variable is needed to run this program
goto end

:okHome
REM Build classpath from ciphertool-libs directory
setlocal EnableDelayedExpansion
cd "%ICP_HOME%"

set ICP_CLASSPATH=
FOR %%c in ("%ICP_HOME%\ciphertool-libs\*.jar") DO (
    set ICP_CLASSPATH=!ICP_CLASSPATH!;"%%c"
)

REM ----- Execute The Requested Command ---------------------------------------
echo Using ICP_HOME:  %ICP_HOME%
echo Using JAVA_HOME: %JAVA_HOME%
set _RUNJAVA="%JAVA_HOME%\bin\java"

%_RUNJAVA% %JAVA_OPTS% ^
  -Dcarbon.home="%ICP_HOME%" ^
  -Dcarbon.config.dir.path="%ICP_HOME%\conf" ^
  -Dorg.wso2.CipherTransformation="RSA/ECB/OAEPwithSHA1andMGF1Padding" ^
  -cp %ICP_CLASSPATH% ^
  org.wso2.ciphertool.CipherTool %*

endlocal
:end

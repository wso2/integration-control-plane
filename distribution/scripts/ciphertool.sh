#!/bin/sh
# ----------------------------------------------------------------------------
# Copyright (c) 2026, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
#
# WSO2 Inc. licenses this file to you under the Apache License,
# Version 2.0 (the "License"); you may not use this file except
# in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
#
# -----------------------------------------------------------------------------
# Cipher Tool script for encrypting secrets used in WSO2 Integration Control Plane
#
# Environment Variable Prerequisites
#
#   ICP_HOME    Home of the ICP installation. If not set, it will be
#               derived from the script's location.
#
#   JAVA_HOME   Must point at your Java Development Kit installation.
#
# Usage:
#   ./ciphertool.sh -Dconfigure   Encrypt the [plain-text] values in the top-level
#                                 [secrets] table of conf/deployment.toml
#   ./ciphertool.sh               Prompt for a single value and print it encrypted
#   ./ciphertool.sh -help         Show all options

# if JAVA_HOME is not set we're not happy
if [ -z "$JAVA_HOME" ]; then
  echo "You must set the JAVA_HOME variable before running the Cipher Tool."
  exit 1
fi

# OS specific support.  $var _must_ be set to either true or false.
cygwin=false;
darwin=false;
os400=false;
mingw=false;
case "`uname`" in
CYGWIN*) cygwin=true;;
MINGW*) mingw=true;;
OS400*) os400=true;;
Darwin*) darwin=true
        if [ -z "$JAVA_VERSION" ] ; then
             JAVA_VERSION="CurrentJDK"
           else
             echo "Using Java version: $JAVA_VERSION"
           fi
           if [ -z "$JAVA_HOME" ] ; then
             JAVA_HOME=/System/Library/Frameworks/JavaVM.framework/Versions/${JAVA_VERSION}/Home
           fi
           ;;
esac

# resolve links - $0 may be a softlink
PRG="$0"

while [ -h "$PRG" ]; do
  ls=`ls -ld "$PRG"`
  link=`expr "$ls" : '.*-> \(.*\)$'`
  if expr "$link" : '.*/.*' > /dev/null; then
    PRG="$link"
  else
    PRG=`dirname "$PRG"`/"$link"
  fi
done

# Get standard environment variables
PRGDIR=`dirname "$PRG"`

# Only set ICP_HOME if not already set
[ -z "$ICP_HOME" ] && ICP_HOME=`cd "$PRGDIR/.." ; pwd`

# For Cygwin, ensure paths are in UNIX format before anything is touched
if $cygwin; then
  [ -n "$JAVA_HOME" ] && JAVA_HOME=`cygpath --unix "$JAVA_HOME"`
  [ -n "$ICP_HOME" ] && ICP_HOME=`cygpath --unix "$ICP_HOME"`
  [ -n "$CLASSPATH" ] && CLASSPATH=`cygpath --path --unix "$CLASSPATH"`
fi

# For OS400
if $os400; then
  # Enable multi threading
  QIBM_MULTI_THREADED=Y
  export QIBM_MULTI_THREADED
fi

# For Mingw, ensure paths are in UNIX format before anything is touched
if $mingw ; then
  [ -n "$ICP_HOME" ] &&
    ICP_HOME="`(cd "$ICP_HOME"; pwd)`"
  [ -n "$JAVA_HOME" ] &&
    JAVA_HOME="`(cd "$JAVA_HOME"; pwd)`"
fi

# Build classpath from ciphertool-libs directory - all JARs in ciphertool-libs/ are included
ICP_CLASSPATH=""
for f in "$ICP_HOME"/ciphertool-libs/*.jar
do
  ICP_CLASSPATH=$ICP_CLASSPATH:$f
done
ICP_CLASSPATH=$ICP_CLASSPATH:$CLASSPATH

# For Cygwin and Mingw (Git Bash), switch paths to Windows format before running java
if $cygwin || $mingw; then
  JAVA_HOME=`cygpath --absolute --windows "$JAVA_HOME"`
  ICP_HOME=`cygpath --absolute --windows "$ICP_HOME"`
  CLASSPATH=`cygpath --path --windows "$CLASSPATH"`
  ICP_CLASSPATH=`cygpath --path --windows "$ICP_CLASSPATH"`
fi

# ----- Execute The Requested Command -----------------------------------------
$JAVA_HOME/bin/java $JAVA_OPTS \
  -Dcarbon.home="$ICP_HOME" \
  -Dcarbon.config.dir.path="$ICP_HOME/conf" \
  -Dorg.wso2.CipherTransformation="RSA/ECB/OAEPwithSHA1andMGF1Padding" \
  -classpath "$ICP_CLASSPATH" \
  org.wso2.ciphertool.CipherTool "$@"

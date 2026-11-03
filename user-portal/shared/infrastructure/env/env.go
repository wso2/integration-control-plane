/*
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com). All Rights Reserved.
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein is strictly forbidden, unless permitted by WSO2 in accordance with
 * the WSO2 Commercial License available at http://wso2.com/licenses.
 * For specific language governing the permissions and limitations under
 * this license, please see the license as well as any agreement you've
 * entered into with WSO2 governing the purchase of this software and any
 * associated services.
 */

package env

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/wso2-enterprise/integration-user-portal-service/shared/infrastructure/logging"
)

// secretEnv prefers <KEY>_FILE over KEY. An empty file or variable is unset, never "".
func secretEnv(key string) (string, bool, error) {
	if path := os.Getenv(key + "_FILE"); path != "" {
		b, err := os.ReadFile(path) // #nosec G304 -- path is the operator-set <KEY>_FILE (CSI-mounted secret), not request input
		if err != nil {
			return "", false, fmt.Errorf("reading %s_FILE: %w", key, err)
		}
		val := strings.TrimSpace(string(b))
		return val, val != "", nil
	}
	val := os.Getenv(key)
	return val, strings.TrimSpace(val) != "", nil
}

func GetString(ctx context.Context, key string, fallback ...string) (string, error) {
	val, ok, err := secretEnv(key)
	if err != nil {
		return "", err
	}
	if !ok {
		if len(fallback) == 0 {
			return "", fmt.Errorf("required environment variable %s is not set", key)
		}
		logging.S(ctx).Infof("Environment variable %s not set. Using fallback value: %s", key, fallback[0])
		return fallback[0], nil
	}

	return val, nil
}

// GetStrings reads a comma-separated list.
func GetStrings(ctx context.Context, key string, fallback ...[]string) ([]string, error) {
	val, ok, err := secretEnv(key)
	if err != nil {
		return nil, err
	}
	if !ok {
		if len(fallback) == 0 {
			return nil, fmt.Errorf("required environment variable %s is not set", key)
		}
		logging.S(ctx).Infof("Environment variable %s not set. Using fallback value: %s", key, strings.Join(fallback[0], ","))
		return fallback[0], nil
	}

	var out []string
	for _, part := range strings.Split(val, ",") {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("environment variable %s names no values", key)
	}

	return out, nil
}

// GetDuration reads a time.ParseDuration string such as "30s" or "2m".
func GetDuration(ctx context.Context, key string, fallback ...time.Duration) (time.Duration, error) {
	val, ok, err := secretEnv(key)
	if err != nil {
		return 0, err
	}
	if !ok {
		if len(fallback) == 0 {
			return 0, fmt.Errorf("required environment variable %s is not set", key)
		}
		logging.S(ctx).Infof("Environment variable %s not set. Using fallback value: %s", key, fallback[0])
		return fallback[0], nil
	}

	valAsDuration, err := time.ParseDuration(val)
	if err != nil {
		return 0, fmt.Errorf("environment variable %s is not a valid duration: %w", key, err)
	}

	return valAsDuration, nil
}

// GetBool reads a strconv.ParseBool string: "true", "false", "1", "0".
func GetBool(ctx context.Context, key string, fallback ...bool) (bool, error) {
	val, ok, err := secretEnv(key)
	if err != nil {
		return false, err
	}
	if !ok {
		if len(fallback) == 0 {
			return false, fmt.Errorf("required environment variable %s is not set", key)
		}
		logging.S(ctx).Infof("Environment variable %s not set. Using fallback value: %t", key, fallback[0])
		return fallback[0], nil
	}

	valAsBool, err := strconv.ParseBool(val)
	if err != nil {
		return false, fmt.Errorf("environment variable %s is not a valid bool: %w", key, err)
	}

	return valAsBool, nil
}

func GetInt(ctx context.Context, key string, fallback ...int) (int, error) {
	val, ok, err := secretEnv(key)
	if err != nil {
		return 0, err
	}
	if !ok {
		if len(fallback) == 0 {
			return 0, fmt.Errorf("required environment variable %s is not set", key)
		}
		logging.S(ctx).Infof("Environment variable %s not set. Using fallback value: %d", key, fallback[0])
		return fallback[0], nil
	}

	valAsInt, err := strconv.Atoi(val)
	if err != nil {
		return 0, fmt.Errorf("environment variable %s is not a valid int: %w", key, err)
	}

	return valAsInt, nil
}

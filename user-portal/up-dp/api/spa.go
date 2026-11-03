/*
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

package api

import (
	"errors"
	"html"
	"io/fs"
	"net/http"
	"os"
	"path"
	"regexp"
	"strings"
)

const indexFile = "index.html"

var titleElement = regexp.MustCompile(`(?is)<title>.*?</title>`)

// spaHandler serves a file of the built SPA when one matches the path, and
// index.html for everything else, so the SPA's router owns every non-API path.
type spaHandler struct {
	root  fs.FS
	files http.Handler

	// title replaces the build's own <title>
	title string
}

func newSPAHandler(dir, title string) http.Handler {
	root := os.DirFS(dir)
	return &spaHandler{root: root, files: http.FileServerFS(root), title: "<title>" + html.EscapeString(title) + "</title>"}
}

func (h *spaHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, http.StatusText(http.StatusMethodNotAllowed), http.StatusMethodNotAllowed)
		return
	}

	name := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
	if name != "" && name != indexFile {
		if info, err := fs.Stat(h.root, name); err == nil && !info.IsDir() {
			// Vite fingerprints everything under assets/, so it never changes.
			if strings.HasPrefix(name, "assets/") {
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			}
			h.files.ServeHTTP(w, r)
			return
		}
	}

	index, err := fs.ReadFile(h.root, indexFile)
	if errors.Is(err, fs.ErrNotExist) {
		http.Error(w, "The portal's web app is not built. Run `make web`, or open the Vite dev server.", http.StatusServiceUnavailable)
		return
	}
	if err != nil {
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	// The page names the current build's fingerprinted assets, so it is revalidated every time.
	w.Header().Set("Cache-Control", "no-cache")
	_, _ = w.Write(titleElement.ReplaceAllLiteral(index, []byte(h.title)))
}

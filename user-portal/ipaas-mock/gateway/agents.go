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

package gateway

import (
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/wso2-enterprise/integration-user-portal-service/shared/web"
)

// thinkTime is how long an agent takes to answer, so the SPA's typing state shows.
const thinkTime = 700 * time.Millisecond

type chatRequest struct {
	SessionID string `json:"sessionId"`
	Message   string `json:"message"`
}

type chatResponse struct {
	Message string `json:"message"`
}

// agents keeps how many turns each session has had, which is all the memory the
// canned agents need.
type agents struct {
	mu    sync.Mutex
	turns map[string]int
}

func newAgents() *agents {
	return &agents{turns: map[string]int{}}
}

func (a *agents) chat(w http.ResponseWriter, r *http.Request, agent, endpoint string) {
	var req chatRequest
	if err := web.ReadJSON(w, r, &req); err != nil {
		web.StatusBadRequest(w, r, err, `Request body must be JSON carrying "sessionId" and "message".`)
		return
	}
	if strings.TrimSpace(req.SessionID) == "" || strings.TrimSpace(req.Message) == "" {
		web.StatusBadRequest(w, r, errors.New("empty chat request"), `"sessionId" and "message" are required.`)
		return
	}

	a.mu.Lock()
	a.turns[agent+"/"+req.SessionID]++
	turn := a.turns[agent+"/"+req.SessionID]
	a.mu.Unlock()

	select {
	case <-time.After(thinkTime):
	case <-r.Context().Done():
		return
	}

	caller := callerFrom(r.Context())
	var reply string
	switch agent {
	case "math-tutor":
		reply = mathTutor(req.Message, turn)
	case "hr-assistant":
		reply = hrAssistant(req.Message, endpoint, caller.Name())
	default:
		reply = "I'm a sample agent. You said: " + req.Message
	}

	web.WriteResponse(w, r, http.StatusOK, chatResponse{Message: reply})
}

var arithmetic = regexp.MustCompile(`[-+*/().\d\s]*\d[-+*/().\d\s]*`)

func mathTutor(message string, turn int) string {
	lower := strings.ToLower(message)
	if strings.Contains(lower, "name") || (turn == 1 && strings.Contains(lower, "hi")) {
		return "I'm your math tutor assistant! How can I help you with your math problems today?"
	}

	for _, candidate := range arithmetic.FindAllString(message, -1) {
		expr := strings.TrimSpace(candidate)
		if !strings.ContainsAny(expr, "+-*/") {
			continue
		}
		value, err := evaluate(expr)
		if err != nil {
			return fmt.Sprintf("I couldn't work out %q: %v. Could you write it another way?", expr, err)
		}
		return fmt.Sprintf("Let's work it out step by step.\n\n%s = %s\n\nFinal answer: %s", expr, format(value), format(value))
	}

	return "Send me an arithmetic problem, such as 12 * (3 + 4), and I'll solve it with you."
}

func hrAssistant(message, endpoint, user string) string {
	lower := strings.ToLower(message)
	greeting := "Hi"
	if user != "" {
		greeting = "Hi " + user
	}

	switch {
	case endpoint == "benefits" || strings.Contains(lower, "benefit") || strings.Contains(lower, "insurance"):
		return greeting + ". Full-time employees get medical cover for themselves and two dependants, and a yearly wellness allowance of 400 USD. Claims go through the Benefits form in the HR portal."
	case strings.Contains(lower, "leave") || strings.Contains(lower, "vacation") || strings.Contains(lower, "holiday"):
		return greeting + ". You have 21 days of annual leave a year, accrued monthly. Up to 5 unused days carry over to the next year. Request leave at least two weeks ahead for anything longer than three days."
	case strings.Contains(lower, "travel"):
		return greeting + ". Book travel through the travel desk. Economy class applies to flights under 6 hours; the per diem depends on the destination."
	default:
		return greeting + ". I can help with leave, benefits and travel policies. What would you like to know?"
	}
}

// evaluate is a recursive-descent calculator for + - * / and parentheses.
func evaluate(expr string) (float64, error) {
	p := &parser{input: strings.Map(func(r rune) rune {
		if unicode.IsSpace(r) {
			return -1
		}
		return r
	}, expr)}
	value, err := p.sum()
	if err != nil {
		return 0, err
	}
	if p.pos != len(p.input) {
		return 0, fmt.Errorf("unexpected %q", p.input[p.pos:])
	}
	return value, nil
}

type parser struct {
	input string
	pos   int
}

func (p *parser) peek() byte {
	if p.pos < len(p.input) {
		return p.input[p.pos]
	}
	return 0
}

func (p *parser) sum() (float64, error) {
	left, err := p.product()
	if err != nil {
		return 0, err
	}
	for op := p.peek(); op == '+' || op == '-'; op = p.peek() {
		p.pos++
		right, err := p.product()
		if err != nil {
			return 0, err
		}
		if op == '+' {
			left += right
		} else {
			left -= right
		}
	}
	return left, nil
}

func (p *parser) product() (float64, error) {
	left, err := p.factor()
	if err != nil {
		return 0, err
	}
	for op := p.peek(); op == '*' || op == '/'; op = p.peek() {
		p.pos++
		right, err := p.factor()
		if err != nil {
			return 0, err
		}
		if op == '*' {
			left *= right
		} else {
			if right == 0 {
				return 0, errors.New("division by zero")
			}
			left /= right
		}
	}
	return left, nil
}

func (p *parser) factor() (float64, error) {
	switch p.peek() {
	case '(':
		p.pos++
		value, err := p.sum()
		if err != nil {
			return 0, err
		}
		if p.peek() != ')' {
			return 0, errors.New("missing )")
		}
		p.pos++
		return value, nil
	case '-':
		p.pos++
		value, err := p.factor()
		return -value, err
	}

	start := p.pos
	for c := p.peek(); (c >= '0' && c <= '9') || c == '.'; c = p.peek() {
		p.pos++
	}
	if start == p.pos {
		return 0, errors.New("expected a number")
	}
	return strconv.ParseFloat(p.input[start:p.pos], 64)
}

func format(v float64) string {
	return strconv.FormatFloat(v, 'f', -1, 64)
}

package plugin

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// fdBudget is the descriptor growth tolerated across a test. The runtime, the
// test server and the Docker client held by TestMain all move a couple of
// descriptors around, so a strict zero would be flaky. A genuine leak is one
// descriptor per request, which is orders of magnitude above this.
const fdBudget = 15

// warp10ErrorHandler answers 500 with the Warp10 error header, the shape of
// response the parsing below has to cope with.
func warp10ErrorHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("X-Warp10-Error-Message", "WarpScript error at line 1")
	w.WriteHeader(http.StatusInternalServerError)
	_, _ = w.Write([]byte("boom"))
}

// openFDs counts the process file descriptors. Linux only.
func openFDs(t *testing.T) int {
	t.Helper()
	entries, err := os.ReadDir("/proc/self/fd")
	if err != nil {
		t.Skipf("no /proc available, Linux-only test: %v", err)
	}
	return len(entries)
}

// settledFDs polls the descriptor count until it comes back within budget of
// base, or until timeout. The transport closes connections from its own
// goroutines, so the count lags the last request by an unpredictable amount.
// Polling keeps a passing run fast and only spends the timeout on a run that
// is about to fail anyway; a fixed sleep would tie the verdict to machine load.
func settledFDs(t *testing.T, base, budget int, timeout time.Duration) int {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for {
		n := openFDs(t)
		if n-base <= budget || time.Now().After(deadline) {
			return n
		}
		time.Sleep(20 * time.Millisecond)
	}
}

// TestExecDoesNotLeakFDsOnErrorStatus is the actual CLOSE_WAIT reproduction.
// The server answers 500 then closes the connection (sends FIN), as any peer
// does once its own idle timeout expires. Without an explicit Body.Close() the
// socket stays in CLOSE_WAIT and its descriptor is never released.
func TestExecDoesNotLeakFDsOnErrorStatus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(warp10ErrorHandler))
	srv.Config.SetKeepAlivesEnabled(false)
	defer srv.Close()

	d := newDatasource(srv.URL)
	defer d.Dispose()

	// Warm up: prime the pool, the buffers and the resolver so the baseline
	// is not polluted by first-request allocations.
	for i := 0; i < 5; i++ {
		_, _ = d.exec(context.Background(), "1 2 +")
	}
	before := openFDs(t)

	const n = 200
	for i := 0; i < n; i++ {
		_, err := d.exec(context.Background(), "1 2 +")
		if err == nil {
			t.Fatal("a 500 status must surface as an error")
		}
		// The header carries the backend diagnostic; losing it would make the
		// plugin unusable even though no descriptor leaks.
		if !strings.Contains(err.Error(), "WarpScript error at line 1") {
			t.Fatalf("error message lost: %v", err)
		}
	}

	after := settledFDs(t, before, fdBudget, 5*time.Second)
	t.Logf("fixed exec, 500 status: %d -> %d file descriptors over %d requests (delta %+d)",
		before, after, n, after-before)

	if delta := after - before; delta > fdBudget {
		t.Fatalf("file descriptor leak: +%d descriptors after %d failing requests "+
			"(before=%d after=%d); check with: ss -tan state close-wait",
			delta, n, before, after)
	}
}

// TestExecDoesNotLeakFDsOnSuccess covers the nominal path: the body is fully
// read, so the connection must go back to the pool and be reused rather than
// piling up. It also pins the returned payload, so the test cannot pass
// vacuously on an exec that returns nothing.
func TestExecDoesNotLeakFDsOnSuccess(t *testing.T) {
	const payload = `[3]`

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(payload))
	}))
	defer srv.Close()

	d := newDatasource(srv.URL)
	defer d.Dispose()

	for i := 0; i < 5; i++ {
		_, _ = d.exec(context.Background(), "1 2 +")
	}
	before := openFDs(t)

	const n = 200
	for i := 0; i < n; i++ {
		body, err := d.exec(context.Background(), "1 2 +")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if string(body) != payload {
			t.Fatalf("body mismatch: got %q, want %q", body, payload)
		}
	}

	after := settledFDs(t, before, fdBudget, 5*time.Second)
	t.Logf("fixed exec, 200 status: %d -> %d file descriptors over %d requests (delta %+d)",
		before, after, n, after-before)

	if delta := after - before; delta > fdBudget {
		t.Fatalf("file descriptor leak on the success path: +%d descriptors after %d requests",
			delta, n)
	}
}

// TestLeakyExecLeaksFDs is the control group: it replicates go-warp10 v0.0.1
// Exec, which returns on a non-200 status without closing the response body.
// It asserts the leak is real, which proves the two assertions above have
// teeth. If this test ever stops leaking, they have become vacuous.
//
// The descriptors it leaks cannot be reclaimed, by definition of the bug: they
// stay open until the test binary exits. Do not raise n, and do not run this
// test with -count greater than 1.
func TestLeakyExecLeaksFDs(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(warp10ErrorHandler))
	srv.Config.SetKeepAlivesEnabled(false)
	defer srv.Close()

	d := newDatasource(srv.URL)
	defer d.Dispose()

	// Verbatim shape of base.(*Client).Exec in v0.0.1, api.go:21-28.
	leakyExec := func() error {
		req, err := http.NewRequest(http.MethodPost, d.url+execPath, strings.NewReader("1 2 +"))
		if err != nil {
			return err
		}
		res, err := d.httpClient.Do(req)
		if err != nil {
			return err
		}
		if res.StatusCode != http.StatusOK {
			// Returns without res.Body.Close(): this is the bug.
			return errors.New(res.Header.Get("X-Warp10-Error-Message"))
		}
		defer func() { _ = res.Body.Close() }()
		return nil
	}

	for i := 0; i < 5; i++ {
		_ = leakyExec()
	}
	before := openFDs(t)

	// No settling wait below: the sockets are opened synchronously by the
	// requests and, being leaked, never go away. The count is already stable.
	const n = 100
	for i := 0; i < n; i++ {
		if err := leakyExec(); err == nil {
			t.Fatal("a 500 status must surface as an error")
		}
	}

	after := openFDs(t)
	t.Logf("leaky exec (go-warp10 v0.0.1): %d -> %d file descriptors over %d requests (delta %+d)",
		before, after, n, after-before)

	if delta := after - before; delta < n/2 {
		t.Fatalf("control group did not leak: +%d descriptors after %d requests, "+
			"expected close to +%d; the descriptor counting method no longer "+
			"detects the bug", delta, n, n)
	}
}

// TestExecReusesConnections checks the drain-before-close actually lets the
// pool recycle connections instead of merely closing them. Counting server
// side proves reuse, which counting descriptors cannot: a client that opened
// and closed one connection per request would also show a flat descriptor
// count while hammering the backend with handshakes.
func TestExecReusesConnections(t *testing.T) {
	var open int64

	srv := httptest.NewUnstartedServer(http.HandlerFunc(warp10ErrorHandler))
	// ConnState must be set before Start, otherwise the server is already
	// serving and early transitions are missed.
	srv.Config.ConnState = func(_ net.Conn, s http.ConnState) {
		switch s {
		case http.StateNew:
			atomic.AddInt64(&open, 1)
		case http.StateClosed, http.StateHijacked:
			atomic.AddInt64(&open, -1)
		}
	}
	srv.Start()
	defer srv.Close()

	d := newDatasource(srv.URL)
	defer d.Dispose()

	const n = 200
	for i := 0; i < n; i++ {
		if _, err := d.exec(context.Background(), "1 2 +"); err == nil {
			t.Fatal("a 500 status must surface as an error")
		}
	}

	got := atomic.LoadInt64(&open)
	t.Logf("server-side connections still open after %d sequential requests: %d", n, got)

	if got > 4 {
		t.Fatalf("no connection reuse: %d connections open after %d sequential "+
			"requests, expected about 1", got, n)
	}
}

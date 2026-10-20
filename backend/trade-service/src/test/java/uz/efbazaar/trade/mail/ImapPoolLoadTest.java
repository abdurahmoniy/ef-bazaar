package uz.efbazaar.trade.mail;
import jakarta.mail.*;
import org.junit.jupiter.api.Test;
import uz.efbazaar.trade.mail.service.*;
import uz.efbazaar.trade.mail.config.MailProperties;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import java.net.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Loopback protocol fixture, never production Mailcow. Exercises real Angus sockets and SELECT. */
class ImapPoolLoadTest {
 @Test void tenMailboxNetworkFixtureNeverKeepsMoreThanEightConnections() throws Exception {
   try (var fixture=new ImapFixture()) {
     var pool=new ImapConnectionPool(new MailProperties(new MailProperties.Imap("127.0.0.1",fixture.port(),1000,1000,300,60),null),
       mock(MailboxPasswordResolver.class)) {
       @Override protected Store openStore(Mailbox mb)throws MessagingException {
        var props=new Properties();props.setProperty("mail.imap.connectiontimeout","1000");props.setProperty("mail.imap.timeout","1000");
        props.setProperty("mail.imap.auth.plain.disable","true");
        Store store=Session.getInstance(props).getStore("imap");store.connect("127.0.0.1",fixture.port(),mb.getEmail(),"test");return store;
       }
     };
     try {
       for(int i=0;i<10;i++) {
         var box=Mailbox.builder().id(new UUID(0,i+1)).email("fixture"+i+"@example.test").build();
         try (var lease=pool.lease(box)) {
           var folder=lease.store().getFolder("INBOX");folder.open(Folder.READ_ONLY);
           assertThat(folder.getMessageCount()).isZero();folder.close(false);
         }
       }
       assertThat(fixture.peak.get()).as("global cached IMAP session ceiling").isLessThanOrEqualTo(8);
     } finally { shutdown(pool); }
   }
 }

 @Test void controlledTenMailboxParallelLoadKeepsExclusiveLeasesAndReportsLatency() throws Exception {
  try(var fixture=new ImapFixture()) {
   var pool=new ImapConnectionPool(new MailProperties(new MailProperties.Imap("127.0.0.1",fixture.port(),1000,1000,300,60),null),mock(MailboxPasswordResolver.class)) {
    @Override protected Store openStore(Mailbox mb)throws MessagingException {
     var props=new Properties();props.setProperty("mail.imap.connectiontimeout","1000");props.setProperty("mail.imap.timeout","1000");props.setProperty("mail.imap.auth.plain.disable","true");
     Store store=Session.getInstance(props).getStore("imap");store.connect("127.0.0.1",fixture.port(),mb.getEmail(),"test");return store;
    }
   };
   var boxes=new ArrayList<Mailbox>();for(int i=0;i<10;i++)boxes.add(Mailbox.builder().id(new UUID(1,i+1)).email("load"+i+"@example.test").build());
   var active=new ConcurrentHashMap<UUID,AtomicInteger>();var peakPerBox=new AtomicInteger();
   var latency=Collections.synchronizedList(new ArrayList<Long>());long start=System.nanoTime();
   try(var workers=Executors.newFixedThreadPool(16)) {
    var futures=new ArrayList<Future<?>>();
    for(int i=0;i<100;i++){var box=boxes.get(i%10);futures.add(workers.submit(()->{
     long begun=System.nanoTime();try(var lease=pool.lease(box)) {
      int concurrent=active.computeIfAbsent(box.getId(),id->new AtomicInteger()).incrementAndGet();peakPerBox.accumulateAndGet(concurrent,Math::max);
      try{var folder=lease.store().getFolder("INBOX");folder.open(Folder.READ_ONLY);assertThat(folder.getMessageCount()).isZero();folder.close(false);}
      finally{active.get(box.getId()).decrementAndGet();}
     }catch(MessagingException e){throw new CompletionException(e);}finally{latency.add(System.nanoTime()-begun);}
    }));}
    for(var future:futures)future.get(30,TimeUnit.SECONDS);
   }finally{shutdown(pool);}
   latency.sort(Long::compare);double duration=(System.nanoTime()-start)/1_000_000.0;
   String report=String.format(Locale.ROOT,"{\"fixture\":\"loopback IMAP, empty INBOX, plaintext test transport\",\"mailboxes\":10,\"operations\":100,\"clients\":16,\"maxCachedStores\":8,\"peakActiveSessions\":%d,\"peakConcurrentLeasesPerMailbox\":%d,\"durationMs\":%.3f,\"p50Ms\":%.3f,\"p95Ms\":%.3f}\n",fixture.peak.get(),peakPerBox.get(),duration,latency.get(49)/1_000_000.0,latency.get(94)/1_000_000.0);
   java.nio.file.Files.writeString(java.nio.file.Path.of("/tmp/c-trade-imap-benchmark.json"),report);
   System.out.println("IMAP fixture benchmark: "+report);
   assertThat(fixture.peak.get()).isLessThanOrEqualTo(8);assertThat(peakPerBox.get()).isEqualTo(1);assertThat(latency).hasSize(100);
  }
 }

 @Test void logoutAcknowledgementReleasesCapacityBeforeHandlerCleanup() throws Exception {
  var acknowledged=new CountDownLatch(1);var cleanup=new CountDownLatch(1);
  try(var fixture=new ImapFixture() {
   @Override void afterLogoutAcknowledged() {
    acknowledged.countDown();
    try { assertThat(cleanup.await(5,TimeUnit.SECONDS)).as("test releases handler cleanup").isTrue(); }
    catch(InterruptedException e){Thread.currentThread().interrupt();throw new AssertionError(e);}
   }
  }) {
   var pool=new ImapConnectionPool(new MailProperties(new MailProperties.Imap("127.0.0.1",fixture.port(),1000,1000,300,60),null),mock(MailboxPasswordResolver.class),1) {
    @Override protected Store openStore(Mailbox mb)throws MessagingException {
     var props=new Properties();props.setProperty("mail.imap.connectiontimeout","1000");props.setProperty("mail.imap.timeout","1000");props.setProperty("mail.imap.auth.plain.disable","true");
     Store store=Session.getInstance(props).getStore("imap");store.connect("127.0.0.1",fixture.port(),mb.getEmail(),"test");return store;
    }
   };
   try {
    var first=Mailbox.builder().id(new UUID(2,1)).email("first@example.test").build();
    var second=Mailbox.builder().id(new UUID(2,2)).email("second@example.test").build();
    try(var lease=pool.lease(first)){assertThat(lease.store().isConnected()).isTrue();}
    try(var lease=pool.lease(second)) {
     assertThat(acknowledged.await(5,TimeUnit.SECONDS)).isTrue();
     assertThat(lease.store().isConnected()).isTrue();
     assertThat(fixture.peak.get()).as("completed LOGOUT is no longer an active protocol session").isLessThanOrEqualTo(1);
    }
   }finally{cleanup.countDown();shutdown(pool);}
  }
 }

 @Test void credentialEnvelopeChangeInvalidatesTheCachedStore() throws Exception {
  try(var fixture=new ImapFixture()) {
   var pool=new ImapConnectionPool(new MailProperties(new MailProperties.Imap("127.0.0.1",fixture.port(),1000,1000,300,60),null),mock(MailboxPasswordResolver.class)) {
    @Override protected Store openStore(Mailbox mb)throws MessagingException {
     var props=new Properties();props.setProperty("mail.imap.connectiontimeout","1000");props.setProperty("mail.imap.timeout","1000");props.setProperty("mail.imap.auth.plain.disable","true");
     Store store=Session.getInstance(props).getStore("imap");store.connect("127.0.0.1",fixture.port(),mb.getEmail(),"test");return store;
    }
   };
   var box=Mailbox.builder().id(UUID.randomUUID()).email("credentials@example.test")
     .encryptedPassword(new byte[]{1}).passwordIv(new byte[]{2}).passwordTag(new byte[]{3}).build();
   try {
    try(var lease=pool.lease(box)){assertThat(lease.store().isConnected()).isTrue();}
    box.setPasswordIv(new byte[]{4});
    try(var lease=pool.lease(box)){assertThat(lease.store().isConnected()).isTrue();}
    assertThat(fixture.opened.get()).isEqualTo(2);
   }finally{shutdown(pool);}
  }
 }

 @Test void oneHundredConcurrentSidebarPollsFetchOnlyTenMailboxesAndCutoffInvalidatesOne()throws Exception {
  try(var fixture=new ImapFixture()) {
   var pool=new ImapConnectionPool(new MailProperties(new MailProperties.Imap("127.0.0.1",fixture.port(),1000,1000,300,60),null),mock(MailboxPasswordResolver.class)) {
    @Override protected Store openStore(Mailbox mb)throws MessagingException {
     var props=new Properties();props.setProperty("mail.imap.connectiontimeout","1000");props.setProperty("mail.imap.timeout","1000");props.setProperty("mail.imap.auth.plain.disable","true");
     Store store=Session.getInstance(props).getStore("imap");store.connect("127.0.0.1",fixture.port(),mb.getEmail(),"test");return store;
    }
   };
   UUID user=UUID.randomUUID();var boxes=new ArrayList<Mailbox>();
   for(int i=0;i<10;i++)boxes.add(Mailbox.builder().id(UUID.randomUUID()).ownerUserId(user).email("sidebar"+i+"@example.test")
     .ownerMailVisibleFrom(java.time.Instant.EPOCH).build());
   var repository=mock(uz.efbazaar.trade.mailbox.service.MailboxService.class);when(repository.listOwnedBy(user)).thenReturn(boxes);
   var service=new MailService(repository,pool,new HtmlSanitizer(),mock(uz.efbazaar.trade.plan.service.MailboxAccessService.class),
       mock(uz.efbazaar.trade.mailbox.service.MailboxPreservationService.class));
   long started=System.nanoTime();
   try(var clients=Executors.newFixedThreadPool(16)) {
    var tasks=new ArrayList<Future<?>>();
    for(int i=0;i<100;i++)tasks.add(clients.submit(()->{
     var summary=service.listMyMailboxes(user);assertThat(summary).hasSize(10);
     assertThat(summary).allSatisfy(row->assertThat(row.unreadCount()).isZero());
    }));
    for(var task:tasks)task.get(30,TimeUnit.SECONDS);
    assertThat(fixture.selects.get()).as("100 ten-mailbox sidebar polls coalesce to ten actual folder reads").isEqualTo(10);
    boxes.getFirst().setOwnerMailVisibleFrom(java.time.Instant.EPOCH.plusSeconds(1));
    service.listMyMailboxes(user);
    assertThat(fixture.selects.get()).as("new ownership cutoff invalidates exactly the changed mailbox").isEqualTo(11);
    String report=String.format(Locale.ROOT,"{\"fixture\":\"real loopback IMAP empty INBOX\",\"sidebarPolls\":100,\"mailboxesPerPoll\":10,\"clients\":16,\"coldFolderReads\":10,\"folderReadsAfterCutoffChange\":11,\"cacheTtlSeconds\":10,\"durationMs\":%.3f}\n",(System.nanoTime()-started)/1_000_000.0);
    java.nio.file.Files.writeString(java.nio.file.Path.of("/tmp/c-trade-sidebar-benchmark.json"),report);System.out.println("Sidebar fixture benchmark: "+report);
   }finally{shutdown(pool);}
  }
 }
 private static void shutdown(ImapConnectionPool pool)throws Exception {
   var stop=ImapConnectionPool.class.getDeclaredMethod("stop");stop.setAccessible(true);stop.invoke(pool);
 }
 static class ImapFixture implements AutoCloseable {
   final ServerSocket server=new ServerSocket(0,50,InetAddress.getLoopbackAddress());
   final ExecutorService executor=Executors.newCachedThreadPool();final AtomicInteger live=new AtomicInteger();final AtomicInteger peak=new AtomicInteger();final AtomicInteger opened=new AtomicInteger();final AtomicInteger selects=new AtomicInteger();
   final Set<Socket> sockets=ConcurrentHashMap.newKeySet();volatile boolean closed;
   ImapFixture()throws IOException { executor.submit(()->{while(!closed)try{var socket=server.accept();sockets.add(socket);executor.submit(()->serve(socket));}catch(IOException e){if(!closed)throw new UncheckedIOException(e);}}); }
   int port(){return server.getLocalPort();}
   void serve(Socket socket) {
     opened.incrementAndGet();int now=live.incrementAndGet();peak.accumulateAndGet(now,Math::max);boolean active=true;
     try(socket;var in=new BufferedReader(new InputStreamReader(socket.getInputStream()));var out=new PrintWriter(socket.getOutputStream(),true)) {
      out.print("* OK fixture ready\r\n");out.flush();
      for(String line;(line=in.readLine())!=null;) {
       String tag=line.split(" ",2)[0];String command=line.substring(tag.length()).trim().toUpperCase(Locale.ROOT);
       if(command.startsWith("CAPABILITY")) out.print("* CAPABILITY IMAP4rev1 UIDPLUS\r\n");
       else if(command.startsWith("EXAMINE")||command.startsWith("SELECT")){selects.incrementAndGet();out.print("* FLAGS (\\Seen \\Deleted)\r\n* 0 EXISTS\r\n* 0 RECENT\r\n* OK [UIDVALIDITY 1] valid\r\n");}
       else if(command.startsWith("SEARCH"))out.print("* SEARCH\r\n");
       else if(command.startsWith("LOGOUT")){
        // The client may open its replacement immediately after this ACK;
        // handler cleanup can run later without retaining an active IMAP session.
        live.decrementAndGet();active=false;out.print("* BYE closing\r\n"+tag+" OK logout\r\n");out.flush();afterLogoutAcknowledged();return;}
       out.print(tag+" OK done\r\n");out.flush();
      }
     }catch(IOException ignored){}finally{sockets.remove(socket);if(active)live.decrementAndGet();}
   }
   void afterLogoutAcknowledged() {}
   @Override public void close()throws Exception{closed=true;server.close();for(var socket:sockets)socket.close();executor.shutdownNow();executor.awaitTermination(2,TimeUnit.SECONDS);}
 }
}

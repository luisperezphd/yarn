import { produce } from "immer";
import { KeyboardEventHandler, MouseEventHandler, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBoolean, useEffectOnce } from "usehooks-ts";
import { arrayBufferToBase64, base64ToArrayBuffer } from "./lib/base64";
import { Button, Divider, FlexColumn, FlexRow, UIText, VerticalDivider } from "./lib/components";
import { compressToBase64, decompressBase64 } from "./lib/compression";
import { BackIcon, CreateIcon, EyeIcon, EyeWithSlashIcon, FavoriteIcon, HomeIcon, ReplyIcon, SearchIcon, SendIcon, UserIcon } from "./lib/icons";
import { Img, cn, getHash, getRelativeTimeString, noop, now, nullthrows, promiseDoneCall, px, useHashState, useRedrawComponent } from "./lib/util";

type PostId = string;
type UsernameType = string;
type Timestamp = number;

const POST_SIZE_LIMIT = 500;
const POST_INFORM_SIZE = 50;
const SHARE_URI_BASE = window.location.origin + window.location.pathname;

const LOG_IN_KEY_CONFIG = {
  algorithm: { name: "AES-GCM", length: 128 },
  extractable: true,
  usage: ["encrypt", "decrypt"] as Array<KeyUsage>,
};

type Like = {
  username: string;
  likedAt: Timestamp;
};

type Post = {
  postId: PostId;
  username: UsernameType;
  createdAt: Timestamp;
  content: string;
  replyPostIds: Array<PostId>;
  likes: Array<Like>;
};

type User = { username: string; imageIndex: number; encryptedUsername: string };

type AppState = {
  users: Array<User>;
  rootPostIds: Array<PostId>;
  allPosts: Array<Post>;
};

const initialAppState: AppState = {
  users: [{ username: "iamyarn", imageIndex: 0, encryptedUsername: "" }],
  allPosts: [
    {
      postId: "xrj391",
      username: "iamyarn",
      createdAt: now(),
      content: "Hi I'm Yarn! 😊\nA serverless, end-to-end encrypted, thread experience.\nFeel free to start a new thread or reply to this one.\nDon't forget to share! ",
      replyPostIds: [],
      likes: [],
    },
  ],
  rootPostIds: ["xrj391"],
};

function useHashAppState(): [AppState, (appState: AppState) => void] {
  const [hash, setHash] = useHashState();

  const [appState, setAppStateValue] = useState<AppState>(initialAppState);
  const isLoadedRef = useRef(false);
  const sessionKeyRef = useRef<string | null>(null);

  const setAppState = useCallback(
    async (appState: AppState) => {
      if (!isLoadedRef.current) {
        alert("Error! Attempted to setAppSate before appState was loaded.");
        return;
      }

      const newHash = await appStateToHashWithoutKey(appState, nullthrows(sessionKeyRef.current));
      setHash(newHash);
    },
    [setHash]
  );

  useEffectOnce(() => {
    if (isLoadedRef.current) return;

    promiseDoneCall(async () => {
      sessionKeyRef.current = await logInKeyCreate();

      if (hash === "") {
        isLoadedRef.current = true;
        setAppStateValue(initialAppState);
        return;
      }

      const hasHasKey = await appStateHashHasKey(hash);

      if (!hasHasKey) {
        alert("Could not load thread. Make sure the link was generated using the share feature and not copy and pasted from the browser address bar.");
        setAppStateValue(initialAppState);
        isLoadedRef.current = true;
        return;
      }

      try {
        const appState = await appStateFromHashWithKey(hash);
        isLoadedRef.current = true;
        setAppState(appState);
      } catch (e) {
        alert("Could not load thread. Something is wrong with the shared link.");
        setAppStateValue(initialAppState);
        isLoadedRef.current = true;
      }
    });
  });

  useEffect(() => {
    // update appState when url `hash` changes
    if (!isLoadedRef.current) return;

    promiseDoneCall(async () => {
      if (hash === "") {
        setAppStateValue(initialAppState);
      } else {
        const newAppState = await appStateFromHashWithoutKey(hash, nullthrows(sessionKeyRef.current));
        setAppStateValue(newAppState);
      }
    });
  }, [hash, setAppStateValue]);

  return [appState, setAppState];
}

export default function IndexPage() {
  const { value: isDirty, setTrue: setDirty, setFalse: setClean } = useBoolean(false);

  const [appState, setAppStateImpl] = useHashAppState();
  const setAppState = useCallback(
    (appState: AppState) => {
      setDirty();
      setAppStateImpl(appState);
    },
    [setAppStateImpl, setDirty]
  );

  useEffect(() => {
    const handler = (e: any) => {
      return !isDirty ? undefined : (e.returnValue = "Are you sure you want to leave? You have shared changes. If you leave you will lose those changes.");
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty, setClean]);

  const { value: isShareModalVisible, setTrue: showShareModal, setFalse: hideShareModal } = useBoolean(false);

  const [shareLink, setShareLink] = useState("");

  useEffect(() => {
    promiseDoneCall(async () => {
      const logInKey = await logInKeyCreate();
      const base = SHARE_URI_BASE;
      const url = `${base}#${await appStateToHashWithKey(appState, logInKey)}`;
      setShareLink(url);
    });
  }, [appState]);

  return (
    <div style={{ paddingLeft: "calc(100vw - 100%)" }}>
      <PostsPage
        appState={appState}
        setAppState={setAppState}
        onShare={() => {
          showShareModal();
          setClean();
        }}
      />
      {isShareModalVisible && <ShareLinkModal link={shareLink} onHide={hideShareModal} />}
    </div>
  );
}

function PostsPage(props: {
  // format
  appState: AppState;
  setAppState: (appState: AppState) => void;
  onShare: () => void;
}) {
  const [actingUser, setActingUser] = useState<User | undefined>(undefined);
  const { value: isNeedLogInModal, setTrue: showNeedLogInModal, setFalse: hideNeedLogInModal } = useBoolean(false);

  const { appState, setAppState } = props;

  const [selectedPostId, setSelectedPostId] = useState<PostId | null>(null);

  const { value: isNewThreadModalVisible, setTrue: showNewThreadModalImpl, setFalse: hideNewThreadModal } = useBoolean(false);

  const showNewThreadModal = useCallback(() => {
    if (!actingUser) {
      showNeedLogInModal();
      return;
    }

    showNewThreadModalImpl();
  }, [actingUser, showNeedLogInModal, showNewThreadModalImpl]);

  const { value: isReplyModalVisible, setTrue: showReplyModalImpl, setFalse: hideReplyModal } = useBoolean(false);

  const showReplyModal = useCallback(() => {
    if (!actingUser) {
      showNeedLogInModal();
      return;
    }

    showReplyModalImpl();
  }, [actingUser, showNeedLogInModal, showReplyModalImpl]);

  const [replyingToPostId, setReplyingToPostId] = useState<PostId | null>(null);

  const togglePostLike = (appState: AppState, postId: PostId) => {
    if (!actingUser) {
      showNeedLogInModal();
      return;
    }

    const postDraft = getPost(appState, postId);
    if (postDraft.likes.find((o) => actingUser.username === o.username)) {
      postDraft.likes = postDraft.likes.filter((o) => actingUser.username !== o.username);
      return;
    } else {
      postDraft.likes.push({ username: actingUser.username, likedAt: now() });
    }
  };

  const [navState, setNavState] = useState<NavState>("home");

  useEffect(() => {
    if (selectedPostId) {
      setNavState("post");
    } else {
      setNavState("home");
    }
  }, [selectedPostId]);

  const { value: isLogInModalVisible, setTrue: showLogInModal, setFalse: hideLogInModal } = useBoolean(false);

  return (
    <div className="pb-20">
      <Img
        src="yarn.png"
        title="Yarn - I'm a serverless, end-to-end encrypted, thread experience."
        className="absolute top-6 left-6 w-14 hover:scale-105 transition-transform cursor-pointer"
        onClick={() => {
          setSelectedPostId(null);
          setNavState("home");
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />
      <TopNavBar
        className="mt-1"
        appState={appState}
        onNewThread={showNewThreadModal}
        selected={navState}
        onSelectedChanged={setNavState}
        onBack={
          !selectedPostId
            ? undefined
            : () => {
                setSelectedPostId(null);
              }
        }
        onShare={props.onShare}
      />
      {isNewThreadModalVisible && (
        <NewThreadModal
          appState={appState}
          user={nullthrows(actingUser)}
          onPost={(value) => {
            setAppState(
              produce(appState, (draft) => {
                const newPost: Post = {
                  postId: generatePostId(appState),
                  username: nullthrows(actingUser).username,
                  createdAt: now(),
                  content: value.trim(),
                  likes: [],
                  replyPostIds: [],
                };
                draft.allPosts.push(newPost);
                draft.rootPostIds.push(newPost.postId);
              })
            );
            hideNewThreadModal();
          }}
          onHide={hideNewThreadModal}
        />
      )}

      <div className="max-w-[700px] px-5 mx-auto">
        {selectedPostId ? (
          // details view
          <PostDetailView
            actingUser={actingUser}
            postId={selectedPostId}
            onLike={(postId) => setAppState(produce(appState, (draft) => togglePostLike(draft, postId)))}
            onReply={() => {
              setReplyingToPostId(selectedPostId);
              showReplyModal();
            }}
            appState={appState}
            setAppState={setAppState}
          />
        ) : (
          <>
            {navState === "home" && (
              <PostsView
                actingUser={actingUser}
                appState={appState}
                onPostSelected={setSelectedPostId}
                onNewThread={() => showNewThreadModal()}
                onReply={(post) => {
                  setReplyingToPostId(post);
                  showReplyModal();
                }}
                onLike={(postId) => setAppState(produce(appState, (draft) => togglePostLike(draft, postId)))}
              />
            )}
            {navState === "search" && (
              <SearchView
                actingUser={actingUser}
                appState={appState}
                onPostSelected={setSelectedPostId}
                onReply={(post) => {
                  setReplyingToPostId(post);
                  showReplyModal();
                }}
                onLike={(postId) => setAppState(produce(appState, (draft) => togglePostLike(draft, postId)))}
              />
            )}
            {navState === "favorite" && (
              <FavoriteView
                actingUser={actingUser}
                appState={appState}
                onPostSelected={setSelectedPostId}
                onReply={(post) => {
                  setReplyingToPostId(post);
                  showReplyModal();
                }}
                onLike={(postId) => setAppState(produce(appState, (draft) => togglePostLike(draft, postId)))}
              />
            )}
          </>
        )}
      </div>
      {isReplyModalVisible && (
        <ReplyModal
          user={nullthrows(actingUser)}
          post={getPost(appState, nullthrows(replyingToPostId))}
          onPost={(replyContent) => {
            setAppState(
              produce(appState, (draft) => {
                const replyingToDraft = getPost(draft, nullthrows(replyingToPostId));

                if (!replyingToDraft) throw new Error("post not found");

                const newPost: Post = {
                  postId: generatePostId(appState),
                  username: nullthrows(actingUser).username,
                  createdAt: now(),
                  content: replyContent.trim(),
                  likes: [],
                  replyPostIds: [],
                };

                replyingToDraft.replyPostIds.push(newPost.postId);
                draft.allPosts.push(newPost);
              })
            );
            hideReplyModal();
          }}
          onHide={hideReplyModal}
          appState={appState}
        />
      )}
      {isNeedLogInModal && <NeedLogInModal onHide={hideNeedLogInModal} onLogIn={showLogInModal} />}
      {isLogInModalVisible && (
        <LogInModal
          appState={appState}
          onHide={hideLogInModal}
          onCreate={(username, imageIndex, logInKey) => {
            promiseDoneCall(async () => {
              const encryptedUsername = await logInKeyEncrypt(logInKey, username);
              setAppState(
                produce(appState, (draft) => {
                  logInKeyEncrypt;
                  const user: User = { username, imageIndex, encryptedUsername };
                  draft.users.push(user);
                  hideLogInModal();
                  // TODO: setTimeout is a hack - need to properly handle the state where appState is updating and actingUser is set
                  setTimeout(() => setActingUser(user), 1000);
                })
              );
            });
          }}
          onLogIn={(logInKey) => {
            // find user that matches
            promiseDoneCall(async () => {
              for (const user of appState.users) {
                const encryptedUsername = await logInKeyEncrypt(logInKey, user.username);

                if (encryptedUsername === user.encryptedUsername) {
                  // TODO: setTimeout is a hack - need to properly handle the state where appState is updating and actingUser is set
                  setTimeout(() => setActingUser(user), 1000);
                  hideLogInModal();
                  return;
                }
              }

              alert("Log in key is not valid.");
            });
          }}
        />
      )}
    </div>
  );
}

function LogInModal(props: {
  // format
  appState: AppState;
  onCreate: (username: string, profileImageIndex: number, logInKey: string) => void;
  onLogIn: (logInKey: string) => void;
  onHide: () => void;
}) {
  const [usernameImpl, setUsername] = useState("");

  const username = usernameImpl.trim();

  const userImageIndexes = props.appState.users.map((o) => o.imageIndex);

  const availablePictureIndexes = getProfilePictures()
    .map((_, i) => i)
    .filter((i) => !userImageIndexes.includes(i));

  const [selectedProfilePictureIndex, setSelectedProfilePicture] = useState(availablePictureIndexes[0]);

  useEffect(() => {
    setSelectedProfilePicture(availablePictureIndexes[0]);
  }, [availablePictureIndexes]);

  let disableMessage;

  if (username.includes("..")) {
    disableMessage = "Username cannot contain consecutive periods.";
  } else if (username.endsWith("..")) {
    disableMessage = "Username cannot contain end with a period.";
  } else if (!/^[a-z0-9.]+$/.test(username)) {
    disableMessage = "Username can only contain the lower characters a-z, digits 0-9, and periods (.).";
  } else if (username.length < 4) {
    disableMessage = "Username must be at least 5 characters.";
  } else if (username.length > 50) {
    disableMessage = "Username must be less than 50 characters.";
  } else if (username.includes(" ")) {
    disableMessage = "Username can't contain spaces.";
  } else if (selectedProfilePictureIndex === -1) {
    disableMessage = "Please select a profile picture.";
  } else if (props.appState.users.find((o) => o.username === username)) {
    disableMessage = "Username not available. Please choose another one.";
  } else {
    disableMessage = null;
  }

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const { value: isEnterKeyVisible, setTrue: showEnterKey, setFalse: hideEnterKey } = useBoolean(false);

  const hash = getHash();

  const { value: isKeyModalVisible, setTrue: showKeyModal, setFalse: hideKeyModal } = useBoolean(false);

  const [logInKey, setLogInKey] = useState("");

  useEffect(() => {
    promiseDoneCall(async () => {
      setLogInKey(await logInKeyCreate());
    });
  }, []);

  return (
    <Modal title="Log in" onHide={props.onHide}>
      <div className="flex flex-col items-center text-lg p-8">
        <input value={username} ref={inputRef} onChange={(e) => setUsername(e.currentTarget.value)} placeholder="Username" className="x:mt-5 w-full bg-zinc-100 outline-offset-0 outline-1 focus:outline-zinc-300 outline-none px-4 py-4 placeholder:text-zinc-400 rounded-xl" />
        <div className="text-zinc-300 flex flex-col items-center mt-4 gap-4 border w-full rounded-xl p-2">
          Choose a profile picture
          <div className="flex gap-4 w-full p-2 justify-evenly">
            {getProfilePictures().map(
              (picture, i) =>
                availablePictureIndexes.includes(i) && (
                  // format
                  <Img
                    // format
                    key={i}
                    src={picture}
                    className={cn("w-16 h-16 cursor-pointer rounded-full border border-zinc-300", i === selectedProfilePictureIndex && "outline-4 outline-black outline outline-offset-1")}
                    onClick={() => setSelectedProfilePicture(i)}
                  />
                )
            )}
          </div>
        </div>
        <button
          onClick={() => {
            showKeyModal();
          }}
          disabled={disableMessage != null}
          title={disableMessage ?? undefined}
          className="mt-4 text-lg w-full bg-black text-white font-medium disabled:text-gray-500 outline-offset-0 outline-1 focus:outline-zinc-300 outline-none px-4 py-5 placeholder:text-zinc-400 rounded-xl disabled:cursor-not-allowed"
        >
          Create Log In
        </button>
        {hash && (
          <>
            <div className="grid grid-cols-[1fr_max-content_1fr] w-full items-center gap-4 mt-6 text-zinc-400">
              <Divider className="mt-1" /> or <Divider className="mt-1" />
            </div>
            <button
              onClick={() => {
                showEnterKey();
              }}
              className="mt-6 text-lg w-full bg-black text-white font-medium disabled:text-gray-500 outline-offset-0 outline-1 focus:outline-zinc-300 outline-none px-4 py-5 placeholder:text-zinc-400 rounded-xl disabled:cursor-not-allowed"
            >
              Use Log In Key
            </button>
          </>
        )}
        {isEnterKeyVisible && <EnterLogInKeyModal onHide={hideEnterKey} onLogin={props.onLogIn} />}
        {isKeyModalVisible && (
          <ShowLogInKeyModal
            // format
            keyString={logInKey}
            onContinue={() => props.onCreate(username.trim(), selectedProfilePictureIndex, logInKey)}
            onHide={hideKeyModal}
          />
        )}
      </div>
    </Modal>
  );
}

function PostDetailView(
  // args
  props: {
    // props
    appState: Readonly<AppState>;
    postId: PostId;
    onReply: () => void;
    onLike: (postId: PostId) => void;
    actingUser?: User;
    setAppState: (appState: AppState) => void;
  }
) {
  const post = getPost(props.appState, props.postId);
  return (
    <div>
      <PostContent actingUser={props.actingUser} post={post} onLike={() => props.onLike(props.postId)} onReply={props.onReply} appState={props.appState} showImage />
      <Divider className="mt-4" />
      {post.replyPostIds.map((postId, i) => (
        <PostReply
          actingUser={props.actingUser}
          key={i}
          post={nullthrows(props.appState.allPosts.find((o) => o.postId === postId))}
          appState={props.appState}
          onReply={props.onReply}
          onLike={props.onLike}
          onSelected={noop} // not applicable
        />
      ))}
    </div>
  );
}

type NavState = "home" | "search" | "create" | "favorite" | "profile" | "post";

function TopNavBar(props: {
  // format
  onNewThread: () => void;
  onBack?: () => void;
  selected: NavState;
  appState: AppState;
  onSelectedChanged: (selected: NavState) => void;
  onShare: () => void;
  className?: string;
}) {
  const { selected } = props;

  return (
    <div className={cn("flex justify-center", props.className)}>
      <div className="grid grid-cols-[max-content_1fr] w-[700px] items-center">
        {props.onBack ? <CircleIconButton title="Back" icon={<BackIcon className="w-7 h-7" />} onClick={props.onBack} className="w-16 h-16 ml-0.5" /> : <span />}
        <FlexRow className="justify-center mt-1">
          <FlexRow className="items-center">
            <NavIconButton
              // format
              icon={<HomeIcon className={cn(selected !== "home" && "text-zinc-400", "w-8 h-8")} isSolid={selected === "home"} />}
              onClick={() => props.onSelectedChanged("home")}
              isNarrow={!!props.onBack}
              title="Home"
            />
            <NavIconButton
              // format
              icon={<SearchIcon className={cn(selected !== "search" && "text-zinc-400", "w-8 h-8")} />}
              onClick={() => props.onSelectedChanged("search")}
              isNarrow={!!props.onBack}
              title="Search"
            />
            <NavIconButton
              // format
              icon={<CreateIcon className={cn(selected !== "create" && "text-zinc-400", "w-8 h-8")} />}
              // onClick={() => props.onSelectedChanged("create")}
              onClick={props.onNewThread} // TODO:
              isNarrow={!!props.onBack}
              title="Start new thread."
            />
            <NavIconButton
              // format
              icon={<FavoriteIcon className={cn(selected !== "favorite" && "text-zinc-400", "w-8 h-8")} isSolid={selected === "favorite"} />}
              onClick={() => props.onSelectedChanged("favorite")}
              isNarrow={!!props.onBack}
              title="Favorites"
            />
            <NavIconButton
              // format
              icon={<SendIcon className={cn(selected !== "profile" && "text-zinc-400", "w-8 h-8")} />}
              title="Share"
              isNarrow={!!props.onBack}
              onClick={props.onShare}
            />
          </FlexRow>
          {
            // hack padding
            props.onBack && <div className="w-16 h-16 ml-0.5" />
          }
        </FlexRow>
      </div>
    </div>
  );
}

function UserImage(props: { appState: AppState; username?: string; className?: string }) {
  const { username } = props;

  if (!username) {
    return <UserIcon className="w-12 h-12 -ml-1 text-zinc-300" />;
  }

  return <Img className={cn("rounded-full border border-zinc-300", props.className ?? "w-10 h-10")} src={getUserImage(props.appState, username)} />;
}

function PostsView(props: { actingUser?: User; appState: Readonly<AppState>; onPostSelected: (postId: PostId) => void; onNewThread: () => void; onReply: (postId: PostId) => void; onLike: (postId: PostId) => void }) {
  const { actingUser, appState } = props;

  return (
    <>
      {/* Start a thread... */}
      <div className="grid grid-cols-[max-content_1fr_max-content] items-center py-3">
        <UserImage appState={props.appState} username={actingUser?.username} />
        <div onClick={props.onNewThread} className="cursor-text h-full flex items-center">
          <UIText className="text-zinc-400 ml-4">Start a thread...</UIText>
        </div>
        <Button label="Post" onClick={noop} isDisabled={true} />
      </div>
      <Divider />
      {/* posts */}
      {appState.rootPostIds
        .slice()
        .reverse()
        .map((postId, i) => {
          const post = nullthrows(
            appState.allPosts.find((o) => o.postId === postId),
            `could not find post with id ${postId}`
          );
          return (
            <Post
              // props
              actingUser={actingUser}
              key={i}
              post={post}
              appState={appState}
              onReply={() => props.onReply(post.postId)}
              onLike={() => props.onLike(post.postId)}
              onSelected={() => props.onPostSelected(post.postId)}
            />
          );
        })}
    </>
  );
}

function SearchView(props: {
  // format
  actingUser?: User;
  appState: Readonly<AppState>;
  onPostSelected: (postId: PostId) => void;
  onReply: (postId: PostId) => void;
  onLike: (postId: PostId) => void;
}) {
  const { actingUser, appState } = props;
  const [search, setSearch] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = appState.allPosts
    .slice()
    .reverse()
    .filter((o) => o.content.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      {/* posts */}
      <input value={search} ref={inputRef} onChange={(e) => setSearch(e.currentTarget.value)} placeholder="Search" className="mt-5 w-full bg-zinc-100 outline-offset-0 outline-1 focus:outline-zinc-300 outline-none px-4 py-4 placeholder:text-zinc-400 rounded-xl" />
      {results.length === 0 ? (
        <div className="flex justify-center mt-8">No matching posts.</div>
      ) : (
        results.map((post, i) => {
          const parentPost = getParentPost(appState, post.postId);

          return (
            <Post
              // format
              actingUser={actingUser}
              key={i}
              post={post}
              appState={appState}
              onReply={parentPost ? undefined : () => props.onReply(post.postId)}
              onLike={() => props.onLike(post.postId)}
              onSelected={() => props.onPostSelected(parentPost ? parentPost.postId : post.postId)}
            />
          );
        })
      )}
    </>
  );
}

function FavoriteView(props: {
  // format
  actingUser?: User;
  appState: Readonly<AppState>;
  onPostSelected: (postId: PostId) => void;
  onReply: (postId: PostId) => void;
  onLike: (postId: PostId) => void;
}) {
  const { actingUser, appState } = props;

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = !actingUser
    ? []
    : appState.allPosts
        .slice()
        .reverse()
        .filter((o) => o.likes.find((o) => o.username === actingUser.username));

  return (
    <>
      {/* posts */}
      {results.length === 0 ? (
        <div className="flex justify-center mt-8">No favorites.</div>
      ) : (
        results.map((post, i) => {
          const parentPost = getParentPost(appState, post.postId);

          return (
            <Post
              // format
              actingUser={actingUser}
              key={i}
              post={post}
              appState={appState}
              onReply={parentPost ? undefined : () => props.onReply(post.postId)}
              onLike={() => props.onLike(post.postId)}
              onSelected={() => props.onPostSelected(parentPost ? parentPost.postId : post.postId)}
            />
          );
        })
      )}
    </>
  );
}

function getParentPost(appState: AppState, postId: PostId): Post | null {
  const isChildPost = !appState.rootPostIds.includes(postId);
  if (!isChildPost) return null;

  for (let i = 0; i < appState.rootPostIds.length; i++) {
    const rootPostId = appState.rootPostIds[i];
    const rootPost = getPost(appState, rootPostId);

    if (rootPost.replyPostIds.includes(postId)) {
      return rootPost;
    }
  }

  return null;
}

function getUser(appState: AppState, username: string): User {
  return nullthrows(appState.users.find((o) => o.username === username));
}

function getUserImage(appState: AppState, username: string) {
  return getProfilePictures()[getUser(appState, username).imageIndex];
}

function TextArea(props: { value: string; onChange: (value: string) => void; inputRef: React.RefObject<HTMLTextAreaElement>; className?: string }) {
  return (
    <textarea
      // format
      ref={props.inputRef}
      value={props.value}
      onChange={(e) => props.onChange(e.currentTarget.value)}
      placeholder="Start a thread..."
      className={cn("w-full resize-none leading-normal", props.className)}
    ></textarea>
  );
}

function ReplyModal(props: { user: User; appState: AppState; post: Post; onPost: (value: string) => void; onHide: () => void }) {
  // TODO: dedup logic between this modal (ReplyModal) and NewThreadModal
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { post } = props;
  const [content, setContent] = useState("");
  const { value: isDiscardVisible, setTrue: showDiscard, setFalse: hideDiscard } = useBoolean(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const { onPost: onPostProp } = props;

  const onPost = useCallback(() => {
    onPostProp(content);
  }, [content, onPostProp]);

  const { onHide: onHideProp } = props;

  const onHide = useCallback(() => {
    if (content.trim() === "") {
      onHideProp();
      return;
    }

    showDiscard();
  }, [content, onHideProp, showDiscard]);

  return (
    <>
      <Modal title="Reply" onHide={onHide} onCtrlEnter={onPost}>
        <div className="p-8">
          <PostContainer username={post.username} hideFacepile post={post} appState={props.appState}>
            <div className="leading-none grid grid-cols-[1fr_max-content]">
              <div>
                <Username username={post.username} />
              </div>
              <div>
                <RelativeTime time={post.createdAt} />
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-4 pr-4 min-h-9">
              {post.content.split("\n").map((o, i) => (
                <div key={i}>{o}</div>
              ))}
            </div>
          </PostContainer>

          <PostContainer username={props.user.username} className="mt-4" post={post} appState={props.appState} hideFacepile>
            <div className="min-h-32 leading-none">
              <div>
                <Username username={props.user.username} />
              </div>
              <TextArea value={content} onChange={setContent} inputRef={inputRef} className="outline-none mt-1 h-24" />
            </div>
          </PostContainer>
        </div>
        {/* footer - post button */}
        <div className="flex items-center justify-end p-4 rounded-b ">
          <Button label="Post" onClick={onPost} isDisabled={content.trim() === ""} />
        </div>
      </Modal>
      {isDiscardVisible && (
        <DiscardModal
          onCancel={() => {
            inputRef.current?.focus();
            hideDiscard();
          }}
          onConfirm={onHideProp}
        />
      )}
    </>
  );
}

function DiscardModal(props: { onCancel: () => void; onConfirm: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => ref.current?.focus(), []);

  return (
    <Modal
      onHide={() => {
        props.onCancel();
      }}
      width={350}
      className="text-lg overflow-hidden"
    >
      <div className="flex justify-center pt-6 pb-5 font-bold">Discard thread?</div>
      <div className="grid grid-cols-2 border-t border-t-gray-300 cursor-pointer">
        <div className="flex items-center justify-center p-4 active:bg-gray-50" onClick={props.onCancel}>
          Cancel
        </div>
        <div ref={ref} tabIndex={1} className="flex items-center justify-center text-red-500 font-bold p-4 border-l border-l-gray-300 active:bg-gray-50 outline-none" onClick={props.onConfirm}>
          Discard
        </div>
      </div>
    </Modal>
  );
}

function NewThreadModal(props: { user: User; onPost: (value: string) => void; onHide: () => void; appState: Readonly<AppState> }) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [content, setContent] = useState("");
  const { value: isDiscardVisible, setTrue: showDiscard, setFalse: hideDiscard } = useBoolean(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const { onPost: onPostProp } = props;

  const charsLeft = POST_SIZE_LIMIT - content.length;
  const isOverLimit = charsLeft < 0;
  const isDisabled = content.trim() === "" || isOverLimit;

  const onPost = useCallback(() => {
    if (isDisabled) {
      return;
    }

    onPostProp(content);
  }, [content, onPostProp, isDisabled]);

  const { onHide: onHideProp } = props;

  const onHide = useCallback(() => {
    if (content.trim() === "") {
      onHideProp();
      return;
    }

    showDiscard();
  }, [content, onHideProp, showDiscard]);

  return (
    <>
      <Modal title="New thread" onHide={onHide} onCtrlEnter={onPost}>
        <div className="p-8">
          <PostContainer username={props.user.username} appState={{ users: [props.user], allPosts: [], rootPostIds: [] }}>
            <div className="min-h-32 leading-none">
              <div>
                <Username username={props.user.username} />
              </div>
              <TextArea value={content} onChange={setContent} inputRef={inputRef} className="outline-none mt-1 h-24" />
            </div>
          </PostContainer>
        </div>
        {/* footer */}
        <div className="flex items-center justify-end p-4 rounded-b ">
          {charsLeft <= POST_INFORM_SIZE && <span className={cn("text-zinc-500", charsLeft < 0 && "text-red-500")}>{charsLeft}</span>}
          <Button label="Post" onClick={onPost} isDisabled={isDisabled} className="ml-4" />
        </div>
      </Modal>
      {isDiscardVisible && (
        <DiscardModal
          onCancel={() => {
            inputRef.current?.focus();
            hideDiscard();
          }}
          onConfirm={onHideProp}
        />
      )}
    </>
  );
}

function Modal(props: { title?: string; onHide: () => void; children: React.ReactNode; onCtrlEnter?: () => void; width?: number; className?: string }) {
  const DEFAULT_MODAL_WIDTH = 640;
  const { width = DEFAULT_MODAL_WIDTH } = props;

  const { onCtrlEnter: onCtrlEnterProp, onHide } = props;

  const onKeyDown: KeyboardEventHandler = useCallback(
    (e) => {
      if (e.code === "Enter" && e.ctrlKey) {
        onCtrlEnterProp?.();
        e.stopPropagation();
      } else if (e.code === "Escape") {
        onHide();
        e.stopPropagation();
      }
    },
    [onCtrlEnterProp, onHide]
  );

  return (
    <div
      // backdrop
      tabIndex={-1}
      aria-hidden="true"
      className={cn(
        // format
        "overflow-y-auto overflow-x-hidden",
        "fixed top-0 right-0 left-0 bottom-0 z-50",
        "flex justify-center items-center",
        "w-full max-h-full"
      )}
      style={{ backgroundColor: "#000b" }}
      onClick={onHide}
      onKeyDown={onKeyDown}
    >
      <div className="relative p-4 w-full max-h-full" style={{ maxWidth: px(width) }}>
        {props.title && <div className="flex justify-center text-white font-bold text-lg">{props.title}</div>}
        <div className={cn("relative bg-white rounded-3xl shadow mt-5", props.className)} onClick={(e) => e.stopPropagation()}>
          {props.children}
        </div>
      </div>
    </div>
  );
}

function Username(props: { username: string }) {
  return <span className="font-medium">{props.username}</span>;
}

function PostContainer(props: {
  // props
  username: string;
  children: React.ReactNode;
  hideFacepile?: boolean;
  className?: string;
  hideLine?: boolean;
  post?: Post;
  appState: Readonly<AppState>;
}) {
  // left side: avatar icon, line, facepile
  return (
    <div className={cn("grid grid-cols-[max-content_1fr]", props.className)}>
      <FlexColumn className="items-center">
        <UserImage appState={props.appState} username={props.username} />
        {!props.hideLine && <VerticalDivider className="h-full w-[2px] mt-2" />}
        {!props.hideLine && !props.hideFacepile && <Facepile className="mt-4 mb-0.5" usernames={!props.post ? [] : props.post.replyPostIds.map((o) => getPost(props.appState, o).username)} appState={props.appState} />}
      </FlexColumn>
      <div className="ml-4">{props.children}</div>
    </div>
  );
}

function PostContent(props: { post: Post; onReply?: () => void; onLike: () => void; actingUser?: User; showImage?: boolean; appState: AppState }) {
  const { post, actingUser } = props;
  const iLike = actingUser != null && !!post.likes.find((o) => o.username === actingUser.username);

  return (
    <>
      {/* username and time */}
      <div className="leading-none grid grid-cols-[1fr_max-content]">
        <FlexRow className="items-center" gap={8}>
          {props.showImage && <UserImage username={post.username} appState={props.appState} />}
          <Username username={post.username} />
        </FlexRow>
        <div className="flex items-center">
          <RelativeTime time={post.createdAt} />
          {/* menu: ... */}
        </div>
      </div>
      {/* post content */}
      <div className="mt-3 flex flex-col gap-4 pr-4">
        {post.content.split("\n").map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
      {/* post action buttons */}
      <FlexRow className="-ml-2 mt-1">
        <CircleIconButton title="Like" icon={<FavoriteIcon className={cn("w-6 h-6", iLike && "text-red-600")} strokeWidth={1.5} isSolid={iLike} />} onClick={props.onLike} />
        {props.onReply && <CircleIconButton title="Reply" icon={<ReplyIcon className="w-6 h-6" />} onClick={props.onReply} />}
      </FlexRow>
      {/* replies and likes */}
      <FlexRow className="mt-3" gap={4}>
        <div className="text-zinc-400">
          {post.replyPostIds.length} replies &#x2027; {post.likes.length} likes
        </div>
      </FlexRow>
    </>
  );
}

function Post(props: { appState: AppState; post: Post; onReply?: () => void; onLike: () => void; actingUser?: User; onSelected: () => void }) {
  const { post } = props;

  return (
    <div className="mt-4 cursor-pointer" onClick={props.onSelected}>
      <PostContainer username={post.username} appState={props.appState} post={props.post} hideLine={props.post.replyPostIds.length === 0}>
        <PostContent actingUser={props.actingUser} post={props.post} onLike={props.onLike} onReply={props.onReply} appState={props.appState} />
      </PostContainer>
      <Divider className="mt-4" />
    </div>
  );
}

function PostReply(props: { appState: AppState; post: Post; onReply: (postId: PostId) => void; onLike: (postId: PostId) => void; actingUser?: User; onSelected: () => void }) {
  const { post } = props;

  return (
    <div className="mt-4 cursor-pointer" onClick={props.onSelected}>
      <PostContainer username={post.username} hideLine post={post} appState={props.appState}>
        <PostReplyContent actingUser={props.actingUser} post={props.post} onLike={() => props.onLike(post.postId)} appState={props.appState} />
      </PostContainer>
      <Divider className="mt-4" />
    </div>
  );
}

function PostReplyContent(props: { post: Post; onLike: () => void; actingUser?: User; showImage?: boolean; appState: AppState }) {
  const { post, actingUser } = props;
  const iLike = actingUser && !!post.likes.find((o) => o.username === actingUser.username);

  return (
    <>
      {/* username and time */}
      <div className="leading-none grid grid-cols-[1fr_max-content]">
        <FlexRow className="items-center" gap={8}>
          {props.showImage && <UserImage username={post.username} appState={props.appState} />}
          <Username username={post.username} />
        </FlexRow>
        <div className="flex items-center">
          <RelativeTime time={post.createdAt} />
          {/* menu: ... */}
        </div>
      </div>
      {/* post content */}
      <div className="mt-3 flex flex-col gap-4 pr-4">
        {post.content.split("\n").map((o, i) => (
          <div key={i}>{o}</div>
        ))}
      </div>
      {/* post action buttons */}
      <FlexRow className="-ml-2 mt-1">
        <CircleIconButton title="Like" icon={<FavoriteIcon className={cn("w-7 h-7", iLike && "text-red-600")} isSolid={iLike} />} onClick={props.onLike} />
      </FlexRow>
      {/* likes */}
      {post.likes.length > 0 && (
        <FlexRow className="mt-3" gap={4}>
          <div className="text-zinc-400">{post.likes.length} likes</div>
        </FlexRow>
      )}
    </>
  );
}

function Facepile(props: { className?: string; usernames: Array<UsernameType>; appState: Readonly<AppState> }) {
  const uniqueUsernames = useMemo(() => Array.from(new Set(props.usernames)), [props.usernames]);
  return (
    <div className={cn("flex -space-x-2", props.className)}>
      {uniqueUsernames.slice(0, 2).map((username, i) => (
        <UserImage key={i} appState={props.appState} username={username} className="h-5 w-5" />
      ))}
    </div>
  );
}

function CircleIconButton(props: { icon: React.ReactNode; onClick: () => void; title: string; className?: string }) {
  const { onClick: onClickProp } = props;

  const onClick: MouseEventHandler<HTMLDivElement> = useCallback(
    (e) => {
      e.stopPropagation();
      onClickProp();
    },
    [onClickProp]
  );

  return (
    <div className={cn("flex items-center justify-center hover:bg-zinc-100 rounded-full p-1.5 active:scale-90 cursor-pointer", props.className)} title={props.title} onClick={onClick}>
      {props.icon}
    </div>
  );
}

function NavIconButton(props: { icon: React.ReactNode; onClick: () => void; isNarrow: boolean; title: string }) {
  return (
    <div className={cn("group flex items-center justify-center relative h-16 cursor-pointer", props.isNarrow ? "w-20" : "w-28")} onClick={props.onClick} title={props.title}>
      <div className="z-10">{props.icon}</div>
      <div className="z-0 absolute w-full h-full rounded-lg bg-white transition-all group-hover:opacity-100 group-hover:bg-zinc-100 scale-75 group-hover:scale-100"></div>
    </div>
  );
}

function getProfilePictures() {
  return [
    // using free license images from unsplash
    // Photo by Amirhosein MirabBashi - https://unsplash.com/photos/a-group-of-balls-of-yarn-sitting-next-to-each-other-1VpjOPkuENM
    "https://images.unsplash.com/photo-1633951109062-4535bc4cd3c1?rect=0,1100,380,380",
    // Photo by Joshua J. Cotten - https://unsplash.com/photos/black-and-white-animal-on-green-grass-during-daytime-IWKIHuzl-tU
    "https://images.unsplash.com/photo-1601247387431-7966d811f30b?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&&auto=format&fit=facearea&facepad=3&w=300&h=300&q=80",
    // Photo by Ravi Patel - https://unsplash.com/photos/smiling-woman-VMGAbeeJTKo
    "https://images.unsplash.com/photo-1566616213894-2d4e1baee5d8?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&&auto=format&fit=facearea&facepad=3&w=300&h=300&q=80",
    // Photo by Karsten Winegeart - https://unsplash.com/photos/woman-in-white-and-red-mickey-mouse-crew-neck-t-shirt-holding-french-fries-s2MjR3xoJkE
    "https://images.unsplash.com/photo-1599577180589-0a0b958016b1?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&&auto=format&fit=facearea&facepad=3&w=300&h=300&q=80",
  ];
}

function RelativeTime(props: { time: number; className?: string }) {
  const current = now();
  const redraw = useRedrawComponent();

  useEffect(() => {
    const interval = setInterval(() => {
      redraw();
    }, 1000 * 60);

    return () => clearInterval(interval);
  }, [redraw]);

  return (
    <span className={cn("text-zinc-400", props.className)} title={new Date(props.time).toUTCString()}>
      {getRelativeTimeString(current - props.time)}
    </span>
  );
}

function getPost(appState: AppState, postId: PostId): Post {
  return nullthrows(
    appState.allPosts.find((o) => o.postId === postId),
    `Could not find post: ${postId}`
  );
}

function generatePostId(appState: AppState): PostId {
  while (true) {
    const randomValues = new Uint8Array(3);
    window.crypto.getRandomValues(randomValues);
    // @ts-ignore
    const id = btoa(String.fromCharCode.apply(null, randomValues));

    if (appState.allPosts.find((o) => o.postId === id)) {
      continue;
    }

    return id;
  }
}

async function logInKeyCreate(): Promise<string> {
  const key = await window.crypto.subtle.generateKey(LOG_IN_KEY_CONFIG.algorithm, LOG_IN_KEY_CONFIG.extractable, LOG_IN_KEY_CONFIG.usage);
  const objectKey = (await window.crypto.subtle.exportKey("jwk", key)).k;
  return nullthrows(objectKey);
}

async function logInKeyToCryptoKey(logInKey: string): Promise<CryptoKey> {
  return await window.crypto.subtle.importKey(
    "jwk",
    {
      k: logInKey,
      alg: "A128GCM",
      ext: true,
      key_ops: ["encrypt", "decrypt"],
      kty: "oct",
    },
    LOG_IN_KEY_CONFIG.algorithm,
    LOG_IN_KEY_CONFIG.extractable,
    LOG_IN_KEY_CONFIG.usage
  );
}

async function logInKeyDecrypt(logInKey: string, encryptedBase64: string): Promise<string> {
  const cryptoKey = await logInKeyToCryptoKey(logInKey);
  const encryptedBytes = base64ToArrayBuffer(encryptedBase64);
  const decrypted2 = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: new Uint8Array(12),
    },
    cryptoKey,
    encryptedBytes
  );
  const unencrypted = new window.TextDecoder().decode(new Uint8Array(decrypted2));
  return unencrypted;
}

async function logInKeyEncrypt(logInKey: string, value: string): Promise<string> {
  const cryptoKey = await logInKeyToCryptoKey(logInKey);
  const encryptedBytes = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: new Uint8Array(12),
    },
    cryptoKey,
    new TextEncoder().encode(value)
  );
  const encryptedBase64 = arrayBufferToBase64(encryptedBytes);
  return encryptedBase64;
}

async function appStateToHashWithoutKey(appState: AppState, logInKey: string): Promise<string> {
  const json = JSON.stringify(appState);
  const compressed = await compressToBase64(json);
  const encryptedHashBody = await logInKeyEncrypt(logInKey, compressed);
  const hashBody = encryptedHashBody;
  return hashBody;
}

async function appStateToHashWithKey(appState: AppState, logInKey: string): Promise<string> {
  const hashBody = await appStateToHashWithoutKey(appState, logInKey);
  const encryptedAndKey = `${hashBody}:${logInKey}`;
  const hash = encryptedAndKey;
  return hash;
}

function appStateGetHashBodyAndKey(hash: string): [string, string | null] {
  const [encryptedBody, key = null] = hash.split(":");
  return [encryptedBody, key];
}

function appStateHashHasKey(hash: string): boolean {
  const [_, hashKey] = appStateGetHashBodyAndKey(hash);
  return hashKey != null;
}

async function appStateFromHashWithKey(hash: string): Promise<AppState> {
  const [encryptedHashBody, hashKey] = appStateGetHashBodyAndKey(hash);

  if (hashKey == null) {
    throw new Error(`This function is meant to be used with a hash that has a key.`);
  }

  return await appStateFromHashWithoutKey(encryptedHashBody, hashKey);
}

async function appStateFromHashWithoutKey(encryptedHashBody: string, logInKey: string): Promise<AppState> {
  const compressed = await logInKeyDecrypt(logInKey, encryptedHashBody);
  const json = await decompressBase64(compressed);
  const appState = JSON.parse(json);
  return appState;
}

function ShowLogInKeyModal(props: { keyString: string; onContinue: () => void; onHide: () => void }) {
  const { value: isKeyVisible, toggle: toggleKeyVisible } = useBoolean(false);

  return (
    <Modal title="This is your log in key" onHide={props.onHide} className="p-8 flex flex-col gap-4 items-center" width={500}>
      <div>
        <span className="font-medium flex justify-center text-lg">Save it to a safe place.</span>
        <span className="flex justify-center">You{"'"}ll need it to log in later.</span>
      </div>
      <div className="flex flex-col gap-2 w-full mt-1">
        <div className="w-full h-11 flex flex-col justify-end">
          <div className="relative w-full flex justify-center border border-zinc-300 p-1.5 rounded-lg font-medium bg-zinc-100 ">
            <div className="flex justify-center text-lg font-bold items-center">{isKeyVisible ? props.keyString : "●●●●●●●●●●●●●●●●●"}</div>
            <div className="absolute right-4 top-2 cursor-pointer" onClick={toggleKeyVisible}>
              {isKeyVisible ? <EyeIcon className="w-6 h-6" /> : <EyeWithSlashIcon className="w-6 h-6" />}
            </div>
          </div>
        </div>
        <CopyToClipboardButton value={props.keyString} />
      </div>
      <BlackButton label="Log In" onClick={props.onContinue} />
    </Modal>
  );
}

function EnterLogInKeyModal(props: { onLogin: (key: string) => void; onHide: () => void }) {
  const [key, setKey] = useState("");

  return (
    <Modal title="Enter log in key" onHide={props.onHide} className="p-8 flex flex-col gap-4" width={500}>
      <div>You create a log in key when you first create a log in for a thread.</div>
      <div>You can use it to log back into that thread.</div>
      <input value={key} onChange={(e) => setKey(e.currentTarget.value)} placeholder="Key" className="w-full bg-zinc-100 outline-offset-0 outline-1 focus:outline-zinc-300 outline-none px-4 py-4 placeholder:text-zinc-400 rounded-xl" />
      <BlackButton label="Log In" onClick={() => props.onLogin(key)} isDisabled={!key.trim().length} />
    </Modal>
  );
}

function ShareLinkModal(props: { link: string; onHide: () => void }) {
  return (
    <Modal title="Share link" onHide={props.onHide} className="p-8 flex flex-col gap-4" width={500}>
      <div>This link will allow the recipient to see the whole thread.</div>
      <div>You can use it to log back into that thread.</div>
      <CopyToClipboardButton value={props.link} />
      <BlackButton label="Close" onClick={props.onHide} />
    </Modal>
  );
}

function NeedLogInModal(props: { onHide: () => void; onLogIn: () => void }) {
  return (
    <Modal title="Log in needed" onHide={props.onHide} className="p-8 flex flex-col gap-4" width={500}>
      <div>You need to log in to to create, reply to, and like posts.</div>
      <BlackButton
        label="Log In"
        onClick={() => {
          props.onLogIn();
          props.onHide();
        }}
      />
      <div className="w-full flex justify-center border border-zinc-300 p-2 rounded-lg font-medium hover:bg-zinc-50 cursor-pointer active:bg-zinc-100" onClick={props.onHide}>
        Cancel
      </div>
    </Modal>
  );
}

function BlackButton(props: { label: string; onClick: () => void; className?: string; title?: string; isDisabled?: boolean }) {
  return (
    <button
      // format
      onClick={props.onClick}
      className={cn("text-lg w-full bg-black text-white font-medium disabled:text-gray-500 outline-offset-0 outline-1 focus:outline-zinc-300 outline-none px-4 py-5 placeholder:text-zinc-400 rounded-xl disabled:cursor-not-allowed", props.className)}
      title={props.title}
      disabled={props.isDisabled}
    >
      {props.label}
    </button>
  );
}

function CopyToClipboardButton(props: { value: string; className?: string }) {
  const [copyButtonLabel, setCopyButtonLabel] = useState("Copy to Clipboard");

  return (
    <div
      className="w-full flex justify-center border border-zinc-300 p-2 rounded-lg font-medium hover:bg-zinc-50 cursor-pointer active:bg-zinc-100"
      onClick={() => {
        promiseDoneCall(async () => {
          setCopyButtonLabel("Copying...");
          try {
            await navigator.clipboard.writeText(props.value);
            setTimeout(() => {
              setCopyButtonLabel("Copied!");

              setTimeout(() => {
                setCopyButtonLabel("Copy to Clipboard");
              }, 1500);
            }, 0);
          } catch (err) {
            setCopyButtonLabel("Copy Failed!");
          }
        });
      }}
    >
      {copyButtonLabel}
    </div>
  );
}

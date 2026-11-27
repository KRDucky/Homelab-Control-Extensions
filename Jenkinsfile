// SPDX-FileCopyrightText: 2026 The Homelab Control Authors
// SPDX-License-Identifier: GPL-3.0-or-later

// Jenkins pipeline for Homelab Control Extensions (docs/development/CI.md). It runs the checks
// CONTRIBUTING.md asks for: reuse lint, the Traefik helper's tests in its pinned image, the
// offline dev-fixture tests, and manifest validation with the current core PDK. Every command
// runs in a throwaway container on the agent's rootless Docker daemon, on a copy of the checkout,
// without network unless a step needs it. Nothing is published, started or deployed. A failing
// check fails the build, and the later checks still run so one report shows every finding.

def failedStages = []
def gitCommit = null

// Official images, pinned by digest (plugins/traefik/build-environment.md records how).
def REUSE_IMAGE = 'docker.io/fsfe/reuse:6.2.0@sha256:85462a75c0f8efda09ddd190b92816b70e7662577c8427429e11e1b9f25a992e'
def PYTHON_IMAGE = 'docker.io/library/python:3.13-slim-trixie@sha256:7249d5587b78209a006dc4a3b5340678f84ea729239193aa559962cd8c1fce50'
def PYYAML_VERSION = '6.0.3'
def CORE_REPO = 'https://github.com/KRDucky/Homelab-Control.git'

// Streams the checkout into a fresh container and runs script there as an unprivileged user.
// The Node image is the one plugins/traefik/Dockerfile pins, read from that file.
def inContainer(String image, String script, boolean network = false) {
  withEnv(["CI_IMAGE=${image}", "CI_SCRIPT=${script}", "CI_NET=${network ? 'bridge' : 'none'}"]) {
    sh '''
      docker info --format '{{json .SecurityOptions}}' | grep -q rootless \
        || { echo "DOCKER_HOST is not a rootless Docker daemon; refusing" >&2; exit 2; }
      tar -C . -cf - . | docker run --rm -i --network "$CI_NET" --user 1000:1000 \
        --cap-drop ALL --security-opt no-new-privileges --cpus 2 --memory 2g --pids-limit 1024 \
        --label hc-ci=1 --label "hc-ci.build=$BUILD_TAG" --env CI_SCRIPT --env HOME=/tmp --entrypoint sh "$CI_IMAGE" \
        -ec 'mkdir -p /tmp/src && tar -xf - -C /tmp/src --no-same-owner && cd /tmp/src && eval "$CI_SCRIPT"'
    '''
  }
}

def nodeImage() {
  return sh(returnStdout: true, script: "sed -n 's/^FROM \\([^ ]*\\) AS base\$/\\1/p' plugins/traefik/Dockerfile").trim()
}

pipeline {
  agent { label 'docker' }
  options {
    timestamps()
    timeout(time: 30, unit: 'MINUTES')
    disableConcurrentBuilds(abortPrevious: true)
    buildDiscarder(logRotator(numToKeepStr: '30'))
  }
  stages {
    stage('trust') {
      steps {
        script {
          // Pull requests from forks are untrusted code; they never run on these persistent agents.
          if (env.CHANGE_FORK) {
            error("Pull request ${env.CHANGE_ID} comes from the fork ${env.CHANGE_FORK}; it is not built here.")
          }
          gitCommit = sh(returnStdout: true, script: 'git rev-parse HEAD').trim()
        }
      }
    }
    stage('reuse lint') {
      steps { catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') { script { inContainer(REUSE_IMAGE, 'reuse lint') } } }
      post { failure { script { failedStages << env.STAGE_NAME } } }
    }
    stage('traefik helper') {
      steps {
        catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
          // The commands from plugins/traefik/build-environment.md. The test stage runs the tests.
          sh '''
            docker build --progress=plain --label hc-ci=1 --target test -t "hc-ci-traefik-test:$BUILD_TAG" plugins/traefik
            docker build --progress=plain --label hc-ci=1 --target runtime -t "hc-ci-traefik-runtime:$BUILD_TAG" plugins/traefik
          '''
        }
      }
      post {
        always { sh 'docker rmi "hc-ci-traefik-test:$BUILD_TAG" "hc-ci-traefik-runtime:$BUILD_TAG" >/dev/null 2>&1 || true' }
        failure { script { failedStages << env.STAGE_NAME } }
      }
    }
    stage('dev fixture tests') {
      steps {
        catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') { script {
          inContainer(nodeImage(), 'node --test $(find dev -name "*.test.mjs" -o -name test.mjs | sort)')
          // PyYAML is the one dependency; it is installed into the throwaway container only.
          inContainer(PYTHON_IMAGE, "pip install -q --user --no-cache-dir PyYAML==${PYYAML_VERSION} && " +
            'python3 -m unittest discover -s dev/traefik-live-test -p "test_*.py" -v', true)
        } }
      }
      post { failure { script { failedStages << env.STAGE_NAME } } }
    }
    stage('manifests (core PDK)') {
      steps {
        catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
          dir('.core-pdk') { deleteDir() }
          // The current core PDK: sdk/plugin of Homelab-Control main (public), nothing else.
          sh """
            git clone -q --depth 1 --filter=blob:none --sparse '${CORE_REPO}' .core-pdk
            git -C .core-pdk sparse-checkout set sdk/plugin
            echo "core PDK at \$(git -C .core-pdk rev-parse HEAD)"
          """
          script {
            inContainer(nodeImage(), '''
              n=0
              for m in $(find plugins -name manifest.hlplugin | sort); do
                node .core-pdk/sdk/plugin/tdk.mjs validate "$m"; n=$((n+1))
              done
              test "$n" -gt 0''')
          }
        }
      }
      post {
        always { dir('.core-pdk') { deleteDir() } }
        failure { script { failedStages << env.STAGE_NAME } }
      }
    }
  }
  post {
    always {
      script {
        def summary = [
          repository: 'KRDucky/Homelab-Control-Extensions',
          branch: env.BRANCH_NAME,
          pullRequest: env.CHANGE_ID ?: null,
          pullRequestTarget: env.CHANGE_TARGET ?: null,
          commit: gitCommit,
          result: currentBuild.currentResult,
          failedStages: failedStages,
          buildUrl: env.BUILD_URL,
          durationMillis: currentBuild.duration,
        ]
        writeFile file: 'ci-result.json', text: groovy.json.JsonOutput.prettyPrint(groovy.json.JsonOutput.toJson(summary))
        archiveArtifacts artifacts: 'ci-result.json'
      }
    }
  }
}
